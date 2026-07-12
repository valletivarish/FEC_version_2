"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp, validateIngestBody, drainWindow, sealGroup } = require("./app");
const { createStation, addReading } = require("./intake");

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
    assert.equal(body.seismic_vibration_mg[0].limit, 25);
    assert.equal(body.wind_speed_kmh[0].limit, 80);
    assert.equal(body.snow_temp_c[0].limit, 2);
    assert.equal(body.snowpack_depth_cm[0].limit, 30);
    assert.deepEqual(body.lift_chair_count, []);
  });
});

test("GET /unknown-path returns 404 json (switch(true) default branch)", async () => {
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
        sensor_type: "wind_speed_kmh",
        site_id: "slope-a",
        unit: "km/h",
        readings: [{ ts: "t0", value: 25 }, { ts: "t1", value: 30 }],
      }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 2 });
  });
});

// Matches the discipline established across this portfolio: /ingest
// validation must be proven with a real HTTP request against a real local
// server on an ephemeral port, not only a unit test of the validation
// function in isolation. Both are covered here.
test("POST /ingest rejects a payload missing a required field with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: "slope-a", readings: [{ ts: "t0", value: 1 }] }),
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
        sensor_type: "snowpack_depth_cm",
        site_id: "slope-a",
        readings: [{ ts: "t0", value: "deep" }],
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
      body: JSON.stringify({ sensor_type: "snowpack_depth_cm", site_id: "slope-a", readings: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test("validateIngestBody unit-level checks", () => {
  assert.equal(validateIngestBody(null), "request body must be a JSON object");
  assert.equal(validateIngestBody({}), "missing required field: sensor_type");
  assert.equal(
    validateIngestBody({ sensor_type: "snowpack_depth_cm", site_id: "slope-a", readings: [{ ts: "t0", value: 1 }] }),
    null
  );
});

test("drainWindow seals accumulated readings and attaches alerts", () => {
  const station = createStation();
  addReading(station, "seismic_vibration_mg", "slope-a", "milli-g", { ts: "t0", value: 30 });
  addReading(station, "seismic_vibration_mg", "slope-a", "milli-g", { ts: "t1", value: 28 });
  const messages = drainWindow(station, "start", "end");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].avg, 29);
  assert.deepEqual(messages[0].alerts, ["avalanche_risk_detected"]);
});

test("drainWindow handles multiple sensor/site groups independently and drains the station", () => {
  const station = createStation();
  addReading(station, "snow_temp_c", "slope-a", "C", { ts: "t0", value: -5 });
  addReading(station, "snow_temp_c", "slope-b", "C", { ts: "t0", value: 3.5 });
  const messages = drainWindow(station, "s", "e");
  assert.equal(messages.length, 2);
  const slopeB = messages.find((m) => m.site_id === "slope-b");
  assert.deepEqual(slopeB.alerts, ["snowpack_instability_risk"]);
  assert.deepEqual(station.groups, {});
});

test("sealGroup carries sensor_type/site_id/unit through to the summary", () => {
  const summary = sealGroup(
    { sensorType: "wind_speed_kmh", siteId: "slope-a", unit: "km/h", readings: [{ ts: "t0", value: 20 }] },
    "s",
    "e"
  );
  assert.equal(summary.sensor_type, "wind_speed_kmh");
  assert.deepEqual(summary.alerts, []);
});
