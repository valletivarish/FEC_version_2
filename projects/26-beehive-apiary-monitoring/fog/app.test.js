"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp, validateIngestBody, drainWindow, sealGroup } = require("./app");
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

test("GET /thresholds exposes the real hard-alert limits", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/thresholds`);
    const body = await res.json();
    assert.equal(body.internal_hive_temp_c[0].limit, 36);
    assert.equal(body.internal_hive_temp_c[1].limit, 32);
    assert.equal(body.hive_weight_kg[0].limit, 20);
    assert.equal(body.acoustic_buzz_frequency_hz[0].limit, 350);
    assert.deepEqual(body.internal_humidity_pct, []);
    assert.deepEqual(body.entrance_traffic_count, []);
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
        sensor_type: "hive_weight_kg",
        site_id: "apiary-a",
        unit: "kg",
        readings: [{ ts: "t0", value: 35.0 }, { ts: "t1", value: 35.4 }],
      }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 2 });
  });
});

// Real HTTP request against a real local server on an ephemeral port -- not
// only a unit test of validateIngestBody() in isolation.
test("POST /ingest rejects a payload missing a required field with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: "apiary-a", readings: [{ ts: "t0", value: 1 }] }),
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
        sensor_type: "internal_hive_temp_c",
        site_id: "apiary-a",
        readings: [{ ts: "t0", value: "warm" }],
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
      body: JSON.stringify({ sensor_type: "internal_hive_temp_c", site_id: "apiary-a", readings: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /ingest rejects a non-object body with 400 (real HTTP request)", async () => {
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
    validateIngestBody({ sensor_type: "hive_weight_kg", site_id: "apiary-a", readings: [{ ts: "t0", value: 1 }] }),
    null
  );
});

test("drainWindow seals accumulated readings and attaches alerts", () => {
  const station = createStation();
  submit(station, "acoustic_buzz_frequency_hz", "apiary-a", "Hz", [
    { ts: "t0", value: 360 },
    { ts: "t1", value: 370 },
  ]);
  const messages = drainWindow(station, "start", "end");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].avg, 365);
  assert.deepEqual(messages[0].alerts, ["swarming_precursor_detected"]);
});

test("drainWindow handles multiple sensor/site groups independently and empties every ring", () => {
  const station = createStation();
  submit(station, "hive_weight_kg", "apiary-a", "kg", [{ ts: "t0", value: 40 }]);
  submit(station, "hive_weight_kg", "apiary-b", "kg", [{ ts: "t0", value: 15 }]);
  const messages = drainWindow(station, "s", "e");
  assert.equal(messages.length, 2);
  const apiaryB = messages.find((m) => m.site_id === "apiary-b");
  assert.deepEqual(apiaryB.alerts, ["colony_starvation_risk"]);

  const secondPass = drainWindow(station, "s2", "e2");
  assert.equal(secondPass.length, 0, "rings should be empty on the very next drain");
});

test("sealGroup carries sensor_type/site_id/unit through to the summary", () => {
  const summary = sealGroup(
    { sensorType: "internal_hive_temp_c", siteId: "apiary-a", unit: "C", readings: [{ ts: "t0", value: 37.5 }] },
    "s",
    "e"
  );
  assert.equal(summary.sensor_type, "internal_hive_temp_c");
  assert.deepEqual(summary.alerts, ["brood_overheat_risk"]);
});
