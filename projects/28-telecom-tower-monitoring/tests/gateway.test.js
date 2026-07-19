import test from "node:test";
import assert from "node:assert/strict";
import { buildApp, validate, enrich } from "../fog/gateway.js";
import { Windower } from "../fog/windower.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
const tick = () => new Promise((r) => setTimeout(r, 15));

test("validate accepts a well-formed envelope", () => {
  assert.equal(validate({ sensor_type: "dc_load_amps", site_id: "site-north", readings: [{ value: 3 }] }), null);
});

test("validate rejects missing fields, empty readings, and bad values", () => {
  assert.match(validate({ sensor_type: "x", readings: [{ value: 1 }] }), /site_id/);
  assert.match(validate({ sensor_type: "x", site_id: "s", readings: [] }), /non-empty/);
  assert.match(validate({ sensor_type: "x", site_id: "s", readings: [{ value: "hi" }] }), /numeric/);
  assert.match(validate([1, 2]), /object/);
});

test("enrich attaches fired alerts to each window", () => {
  const out = enrich([{ sensor_type: "battery_charge_pct", min: 10, max: 12, mean: 11, last: 10 }]);
  assert.deepEqual(out[0].alerts.sort(), ["battery_critical", "battery_low"]);
});

test("POST /ingest buffers readings and returns 202", async () => {
  const windower = new Windower(10000);
  const { server, base } = await listen(buildApp({ windower }));
  try {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sensor_type: "dc_load_amps", site_id: "site-north", unit: "A", readings: [{ ts: "t", value: 33 }] }),
    });
    assert.equal(res.status, 202);
    assert.equal(windower.pending(), 1);
  } finally { server.close(); }
});

test("POST /ingest rejects a malformed body with 400", async () => {
  const { server, base } = await listen(buildApp({ windower: new Windower(10000) }));
  try {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sensor_type: "x" }),
    });
    assert.equal(res.status, 400);
  } finally { server.close(); }
});

test("GET /health and /thresholds respond", async () => {
  const { server, base } = await listen(buildApp({ windower: new Windower(10000) }));
  try {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.status, "ok");
    const thr = await (await fetch(`${base}/thresholds`)).json();
    assert.ok("battery_charge_pct" in thr);
  } finally { server.close(); }
});

test("a window flush enriches and forwards the batch to the sink", async () => {
  const windower = new Windower(10000);
  const captured = [];
  const app = buildApp({ windower, sink: (batch) => captured.push(batch) });
  const { server, base } = await listen(app);
  try {
    await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sensor_type: "battery_charge_pct", site_id: "site-south", unit: "%", readings: [{ value: 10 }, { value: 12 }] }),
    });
    windower.flush();
    await tick();
    assert.equal(captured.length, 1);
    assert.ok(captured[0][0].alerts.includes("battery_critical"));
  } finally { server.close(); }
});
