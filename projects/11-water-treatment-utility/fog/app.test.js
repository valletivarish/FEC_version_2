"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFogServer, checkIngestPayload, harvestWindow, finalizeGroup, pushWindow } = require("./app");
const { openReadingBuffer, bufferReading } = require("./ledger");
const gateway = require("./publisher");

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
  await withServer(buildFogServer(), async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("GET /thresholds exposes the real hard-alert limits", async () => {
  await withServer(buildFogServer(), async (base) => {
    const res = await fetch(`${base}/thresholds`);
    const body = await res.json();
    assert.equal(body.turbidity_ntu[0].limit, 5);
    assert.equal(body.ph_level[0].limit, 6.5);
    assert.equal(body.chlorine_ppm[0].limit, 0.2);
    assert.equal(body.pressure_bar[0].limit, 2);
    assert.deepEqual(body.flow_rate_lps, []);
  });
});

test("GET /unknown-path returns 404 json", async () => {
  await withServer(buildFogServer(), async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});

test("POST /ingest accepts a well-formed payload with 202 (real HTTP-level test)", async () => {
  await withServer(buildFogServer(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sensor_type: "ph_level",
        site_id: "plant-1",
        unit: "pH",
        readings: [{ ts: "t0", value: 7.0 }, { ts: "t1", value: 7.1 }],
      }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 2 });
  });
});

test("POST /ingest rejects a payload missing a required field with 400 (real HTTP request)", async () => {
  await withServer(buildFogServer(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: "plant-1", readings: [{ ts: "t0", value: 1 }] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /sensor_type/);
  });
});

test("POST /ingest rejects malformed JSON body with 400 (real HTTP request)", async () => {
  await withServer(buildFogServer(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    assert.equal(res.status, 400);
  });
});

test("POST /ingest rejects readings with a non-numeric value with 400 (real HTTP request)", async () => {
  await withServer(buildFogServer(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sensor_type: "turbidity_ntu",
        site_id: "plant-1",
        readings: [{ ts: "t0", value: "cloudy" }],
      }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /ingest rejects an empty readings array with 400 (real HTTP request)", async () => {
  await withServer(buildFogServer(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sensor_type: "turbidity_ntu", site_id: "plant-1", readings: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test("checkIngestPayload unit-level checks", () => {
  assert.equal(checkIngestPayload(null), "request body must be a JSON object");
  assert.equal(checkIngestPayload({}), "missing required field: sensor_type");
  assert.equal(
    checkIngestPayload({ sensor_type: "turbidity_ntu", site_id: "plant-1", readings: [{ ts: "t0", value: 1 }] }),
    null
  );
});

test("harvestWindow seals accumulated readings and attaches alerts", () => {
  const ledger = openReadingBuffer();
  bufferReading(ledger, { sensorType: "chlorine_ppm", siteId: "plant-1", unit: "ppm", ts: "t0", value: 0.1 });
  bufferReading(ledger, { sensorType: "chlorine_ppm", siteId: "plant-1", unit: "ppm", ts: "t1", value: 0.15 });
  const messages = harvestWindow(ledger, "start", "end");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].avg, 0.125);
  assert.deepEqual(messages[0].alerts, ["under_chlorination"]);
});

test("harvestWindow handles multiple sensor/site groups independently and drains the ledger", () => {
  const ledger = openReadingBuffer();
  bufferReading(ledger, { sensorType: "pressure_bar", siteId: "plant-1", unit: "bar", ts: "t0", value: 4.0 });
  bufferReading(ledger, { sensorType: "pressure_bar", siteId: "plant-2", unit: "bar", ts: "t0", value: 1.5 });
  const messages = harvestWindow(ledger, "s", "e");
  assert.equal(messages.length, 2);
  const plant2 = messages.find((m) => m.site_id === "plant-2");
  assert.deepEqual(plant2.alerts, ["low_pressure_fault"]);
  assert.equal(ledger.entries.length, 0, "ledger should be empty after harvestWindow");
});

test("pushWindow dispatches a whole window's messages via one sendWindow call, not one sendOne per message", async () => {
  gateway.clearGateway();
  const sent = [];
  gateway.attachClient({
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/wtu-plant-agg" };
      sent.push(command);
      return {};
    },
  });
  const ledger = openReadingBuffer();
  bufferReading(ledger, { sensorType: "ph_level", siteId: "plant-1", unit: "pH", ts: "t0", value: 7.0 });
  bufferReading(ledger, { sensorType: "turbidity_ntu", siteId: "plant-2", unit: "NTU", ts: "t0", value: 1.0 });
  const messages = await pushWindow(ledger);
  assert.equal(messages.length, 2);
  assert.equal(sent.length, 1, "one SendMessageBatchCommand, not two individual SendMessageCommand calls");
  assert.equal(sent[0].input.Entries.length, 2);
  gateway.clearGateway();
});

test("pushWindow sends nothing when the window has no messages", async () => {
  gateway.clearGateway();
  let sends = 0;
  gateway.attachClient({ send: async () => { sends += 1; return {}; } });
  const messages = await pushWindow(openReadingBuffer());
  assert.equal(messages.length, 0);
  assert.equal(sends, 0);
  gateway.clearGateway();
});

test("finalizeGroup carries sensor_type/site_id/unit through to the summary", () => {
  const summary = finalizeGroup(
    { sensorType: "ph_level", siteId: "plant-1", unit: "pH", readings: [{ ts: "t0", value: 6.2 }] },
    "s",
    "e"
  );
  assert.equal(summary.sensor_type, "ph_level");
  assert.deepEqual(summary.alerts, ["acidic_violation"]);
});
