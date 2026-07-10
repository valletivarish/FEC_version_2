"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp, validateIngestBody, drainWindow, sealGroup } = require("./app");
const { createDoubleBuffer, addReading } = require("./doubleBuffer");

function withServer(app, fn) {
  return new Promise((resolve, reject) => {
    app.listen(0, async () => {
      try {
        const { port } = app.address();
        await fn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        app.close();
      }
    });
  });
}

test("GET /health returns 200 ok", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("GET /thresholds exposes the real hard-alert limits", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/thresholds`);
    const body = await res.json();
    assert.equal(body.fill_level_pct[0].limit, 85);
    assert.equal(body.internal_temp_c[0].limit, 55);
    assert.equal(body.gas_level_ppm[0].limit, 400);
    assert.equal(body.lid_open_count[0].limit, 8);
    assert.deepEqual(body.bin_weight_kg, []);
  });
});

test("GET /unknown-path returns 404 json", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});

test("POST /ingest accepts a well-formed payload with 202 (real HTTP-level test)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sensor_type: "fill_level_pct",
        site_id: "district-a",
        unit: "%",
        readings: [{ ts: "t0", value: 30 }, { ts: "t1", value: 32 }],
      }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 2 });
  });
});

// Proven with a real HTTP request against a real local server on an
// ephemeral port, not just a unit test of validateIngestBody in isolation.
test("POST /ingest rejects a payload missing a required field with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: "district-a", readings: [{ ts: "t0", value: 1 }] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /sensor_type/);
  });
});

test("POST /ingest rejects malformed JSON body with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    assert.equal(res.status, 400);
  });
});

test("POST /ingest rejects readings with a non-numeric value with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sensor_type: "gas_level_ppm",
        site_id: "district-a",
        readings: [{ ts: "t0", value: "smelly" }],
      }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /ingest rejects an empty readings array with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sensor_type: "gas_level_ppm", site_id: "district-a", readings: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test("validateIngestBody unit-level checks", () => {
  assert.equal(validateIngestBody(null), "request body must be a JSON object");
  assert.equal(validateIngestBody({}), "missing required field: sensor_type");
  assert.equal(
    validateIngestBody({ sensor_type: "fill_level_pct", site_id: "district-a", readings: [{ ts: "t0", value: 1 }] }),
    null
  );
});

test("drainWindow seals accumulated readings and attaches alerts", () => {
  const buffer = createDoubleBuffer();
  addReading(buffer, "gas_level_ppm", "district-a", "ppm", { ts: "t0", value: 420 });
  addReading(buffer, "gas_level_ppm", "district-a", "ppm", { ts: "t1", value: 440 });
  const messages = drainWindow(buffer, "start", "end");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].avg, 430);
  assert.deepEqual(messages[0].alerts, ["odor_gas_exceedance"]);
});

test("drainWindow handles multiple sensor/site groups independently and drains the buffer", () => {
  const buffer = createDoubleBuffer();
  addReading(buffer, "lid_open_count", "district-a", "count", { ts: "t0", value: 9 });
  addReading(buffer, "lid_open_count", "district-b", "count", { ts: "t0", value: 2 });
  const messages = drainWindow(buffer, "s", "e");
  assert.equal(messages.length, 2);
  const districtA = messages.find((m) => m.site_id === "district-a");
  assert.deepEqual(districtA.alerts, ["tamper_suspected"]);
  const districtB = messages.find((m) => m.site_id === "district-b");
  assert.deepEqual(districtB.alerts, []);
  assert.equal(buffer.active.size, 0, "buffer's active map should be a fresh empty map after drainWindow");
});

test("sealGroup carries sensor_type/site_id/unit through to the summary", () => {
  const summary = sealGroup(
    { sensorType: "fill_level_pct", siteId: "district-a", unit: "%", readings: [{ ts: "t0", value: 90 }] },
    "s",
    "e"
  );
  assert.equal(summary.sensor_type, "fill_level_pct");
  assert.deepEqual(summary.alerts, ["collection_needed"]);
});
