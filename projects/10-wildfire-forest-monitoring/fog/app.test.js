"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp, validateIngestBody, drainWindow, sealGroup } = require("./app");
const { createStation } = require("./buffer");

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
    assert.equal(body.temperature_c[0].limit, 42);
    assert.equal(body.smoke_density_ppm[0].key, "fire_detected");
    assert.equal(body.wind_speed_kmh[0].limit, 60);
    assert.equal(body.soil_moisture_pct[0].limit, 10);
  });
});

test("GET /unknown-path returns 404 json", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});

test("POST /ingest accepts a well-formed payload and buffers it (real HTTP-level test)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sensor_type: "temperature_c",
        site_id: "station-1",
        unit: "C",
        readings: [{ ts: "t0", value: 22 }, { ts: "t1", value: 23 }],
      }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 2 });
  });
});

// /ingest validation must be proven with a real HTTP request against a real
// local server, not only a unit test of validateIngestBody in isolation.
// Both are included below.
test("POST /ingest rejects a payload missing a required field with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: "station-1", readings: [{ ts: "t0", value: 1 }] }),
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
        sensor_type: "temperature_c",
        site_id: "station-1",
        readings: [{ ts: "t0", value: "hot" }],
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
      body: JSON.stringify({ sensor_type: "temperature_c", site_id: "station-1", readings: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test("validateIngestBody unit-level checks", () => {
  assert.equal(validateIngestBody(null), "request body must be a JSON object");
  assert.equal(validateIngestBody({}), "missing required field: sensor_type");
  assert.equal(
    validateIngestBody({ sensor_type: "temperature_c", site_id: "station-1", readings: [{ ts: "t0", value: 1 }] }),
    null
  );
});

test("drainWindow seals accumulated readings and attaches alerts", () => {
  const station = createStation();
  station.submit("smoke_density_ppm", "station-1", "ppm", [{ ts: "t0", value: 200 }, { ts: "t1", value: 180 }]);
  const messages = drainWindow(station, "start", "end");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].avg, 190);
  assert.deepEqual(messages[0].alerts, ["fire_detected"]);
});

test("drainWindow handles multiple sensor/site groups independently", () => {
  const station = createStation();
  station.submit("wind_speed_kmh", "station-1", "km/h", [{ ts: "t0", value: 20 }]);
  station.submit("wind_speed_kmh", "station-2", "km/h", [{ ts: "t0", value: 70 }]);
  const messages = drainWindow(station, "s", "e");
  assert.equal(messages.length, 2);
  const station2 = messages.find((m) => m.site_id === "station-2");
  assert.deepEqual(station2.alerts, ["high_wind_warning"]);
});

test("sealGroup carries sensor_type/site_id/unit through to the summary", () => {
  const summary = sealGroup(
    { sensorType: "soil_moisture_pct", siteId: "station-1", unit: "%", readings: [{ ts: "t0", value: 8 }] },
    "s",
    "e"
  );
  assert.equal(summary.sensor_type, "soil_moisture_pct");
  assert.deepEqual(summary.alerts, ["drought_risk"]);
});
