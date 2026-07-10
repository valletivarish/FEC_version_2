"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createApp, validateIngestBody, drainWindow, sealGroup, flushOnce } = require("./app");
const { createStation, submit } = require("./ringBuffer");

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

test("GET /thresholds exposes the exact 6 hard-alert rules across 5 sensor types", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/thresholds`);
    const body = await res.json();
    assert.equal(body.temperature_c[0].limit, 27);
    assert.equal(body.humidity_pct[0].limit, 60);
    assert.equal(body.humidity_pct[1].limit, 20);
    assert.equal(body.airflow_cfm[0].limit, 400);
    assert.equal(body.power_load_kw[0].limit, 130);
    assert.equal(body.dust_density_ugm3[0].limit, 50);
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
        sensor_type: "temperature_c",
        site_id: "hall-1",
        unit: "C",
        readings: [{ ts: "t0", value: 22.1 }, { ts: "t1", value: 22.4 }],
      }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 2 });
  });
});

test("POST /ingest rejects a payload missing a required field with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: "hall-1", readings: [{ ts: "t0", value: 1 }] }),
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
        sensor_type: "humidity_pct",
        site_id: "hall-1",
        readings: [{ ts: "t0", value: "damp" }],
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
      body: JSON.stringify({ sensor_type: "humidity_pct", site_id: "hall-1", readings: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /ingest rejects a body that is not a JSON object with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    assert.equal(res.status, 400);
  });
});

test("validateIngestBody unit-level checks", () => {
  assert.equal(validateIngestBody(null), "request body must be a JSON object");
  assert.equal(validateIngestBody({}), "missing required field: sensor_type");
  assert.equal(
    validateIngestBody({ sensor_type: "temperature_c", site_id: "hall-1", readings: [{ ts: "t0", value: 1 }] }),
    null
  );
});

test("sealGroup attaches alerts computed from the real threshold rules", () => {
  const summary = sealGroup(
    { sensorType: "power_load_kw", siteId: "hall-2", unit: "kW", readings: [{ ts: "t0", value: 140 }] },
    "s",
    "e"
  );
  assert.equal(summary.sensor_type, "power_load_kw");
  assert.deepEqual(summary.alerts, ["capacity_warning"]);
});

test("drainWindow groups by (sensor_type, site_id) and drains the ring buffer station", () => {
  const station = createStation();
  submit(station, "dust_density_ugm3", "hall-1", "ug/m3", [{ ts: "t0", value: 60 }, { ts: "t1", value: 55 }]);
  submit(station, "dust_density_ugm3", "hall-2", "ug/m3", [{ ts: "t0", value: 5 }]);
  const messages = drainWindow(station, "s", "e");
  assert.equal(messages.length, 2);
  const hall1 = messages.find((m) => m.site_id === "hall-1");
  const hall2 = messages.find((m) => m.site_id === "hall-2");
  assert.deepEqual(hall1.alerts, ["air_quality_risk"]);
  assert.deepEqual(hall2.alerts, []);

  const again = drainWindow(station, "s2", "e2");
  assert.deepEqual(again, [], "the station's rings should be empty after the first drain");
});

test("flushOnce emits window-closed with the sealed messages and never itself awaits SQS", () => {
  const station = createStation();
  submit(station, "temperature_c", "hall-1", "C", [{ ts: "t0", value: 30 }]);
  const emitter = new EventEmitter();
  const received = [];
  emitter.on("window-closed", (messages) => received.push(messages));

  const messages = flushOnce(station, emitter);

  assert.equal(messages.length, 1);
  assert.equal(received.length, 1, "window-closed should have fired exactly once");
  assert.deepEqual(received[0], messages);
  assert.deepEqual(messages[0].alerts, ["overheat_risk"]);
});

test("flushOnce with multiple groups closed in one tick emits all of them together in one event", () => {
  const station = createStation();
  submit(station, "temperature_c", "hall-1", "C", [{ ts: "t0", value: 22 }]);
  submit(station, "humidity_pct", "hall-1", "%", [{ ts: "t0", value: 45 }]);
  submit(station, "temperature_c", "hall-2", "C", [{ ts: "t0", value: 23 }]);
  const emitter = new EventEmitter();
  let batch = null;
  emitter.on("window-closed", (messages) => {
    batch = messages;
  });
  flushOnce(station, emitter);
  assert.equal(batch.length, 3, "all 3 groups from this flush cycle should arrive in a single window-closed event");
});
