"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp, validateIngestBody, flushOnce, sealGroup, makeUnitTracker } = require("./app");
const { createBuffer, addReading } = require("./windowBuffer");

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

test("GET /thresholds exposes the exact hard-alert limits", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/thresholds`);
    const body = await res.json();
    assert.equal(body.motor_temp_c[0].limit, 85);
    assert.equal(body.cab_vibration_mm[0].limit, 6);
    assert.equal(body.load_weight_kg[0].limit, 1000);
    assert.equal(body.load_weight_kg[0].field, "max");
    assert.equal(body.travel_speed_mps[0].limit, 0.5);
    assert.equal(body.travel_speed_mps[0].op, "<");
    assert.deepEqual(body.door_cycle_count, []);
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
        sensor_type: "motor_temp_c",
        site_id: "tower-a",
        unit: "C",
        readings: [{ ts: "t0", value: 55.2 }, { ts: "t1", value: 56.1 }],
      }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 2 });
  });
});

// Proven with a real HTTP request against a real local server on an
// ephemeral port, not merely a unit test of validateIngestBody in isolation
// (that is covered separately below too).
test("POST /ingest rejects a payload missing a required field with 400 (real HTTP request)", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: "tower-a", readings: [{ ts: "t0", value: 1 }] }),
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
        sensor_type: "cab_vibration_mm",
        site_id: "tower-a",
        readings: [{ ts: "t0", value: "shaky" }],
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
      body: JSON.stringify({ sensor_type: "cab_vibration_mm", site_id: "tower-a", readings: [] }),
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
    validateIngestBody({ sensor_type: "motor_temp_c", site_id: "tower-a", readings: [{ ts: "t0", value: 1 }] }),
    null
  );
});

test("sealGroup attaches alerts computed from the window aggregate", () => {
  const summary = sealGroup(
    { sensorType: "motor_temp_c", siteId: "tower-a", readings: [{ ts: "t0", value: 90 }, { ts: "t1", value: 92 }] },
    "C",
    "s",
    "e"
  );
  assert.equal(summary.avg, 91);
  assert.deepEqual(summary.alerts, ["motor_overheat_risk"]);
});

test("sealGroup returns no alerts for a sensor type with no registered rule", () => {
  const summary = sealGroup(
    { sensorType: "door_cycle_count", siteId: "tower-b", readings: [{ ts: "t0", value: 400 }] },
    "count",
    "s",
    "e"
  );
  assert.deepEqual(summary.alerts, []);
});

test("makeUnitTracker records and returns the last-seen unit per sensor type", () => {
  const tracker = makeUnitTracker();
  assert.equal(tracker.get("motor_temp_c"), "");
  tracker.record("motor_temp_c", "C");
  assert.equal(tracker.get("motor_temp_c"), "C");
  tracker.record("motor_temp_c", undefined);
  assert.equal(tracker.get("motor_temp_c"), "C", "an undefined unit on a later batch should not clear the tracked unit");
});

test("flushOnce seals and publishes every non-empty buffer group, then clears the buffer", async () => {
  const publisher = require("./publisher");
  publisher.reset();
  const sent = [];
  publisher.useClient({ send: async (command) => {
    if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/eef-tower-agg" };
    for (const entry of command.input.Entries) sent.push(JSON.parse(entry.MessageBody));
    return {};
  } }, "eef-tower-agg");

  const buffer = createBuffer();
  addReading(buffer, "load_weight_kg", "tower-a", { ts: "t0", value: 1100 });
  addReading(buffer, "load_weight_kg", "tower-a", { ts: "t1", value: 900 });
  const unitTracker = makeUnitTracker();
  unitTracker.record("load_weight_kg", "kg");

  const messages = await flushOnce(buffer, unitTracker);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].max, 1100);
  assert.deepEqual(messages[0].alerts, ["overload_warning"]);
  assert.equal(sent.length, 1);
  assert.equal(buffer.size, 0);
});

test("flushOnce sends every sealed group through a single SendMessageBatch call, not one call per group", async () => {
  const publisher = require("./publisher");
  publisher.reset();
  let batchCalls = 0;
  publisher.useClient({ send: async (command) => {
    if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/eef-tower-agg" };
    batchCalls += 1;
    return {};
  } }, "eef-tower-agg");

  const buffer = createBuffer();
  addReading(buffer, "load_weight_kg", "tower-a", { ts: "t0", value: 900 });
  addReading(buffer, "motor_temp_c", "tower-b", { ts: "t0", value: 40 });
  addReading(buffer, "cab_vibration_mm", "tower-a", { ts: "t0", value: 1 });
  const unitTracker = makeUnitTracker();

  const messages = await flushOnce(buffer, unitTracker);
  assert.equal(messages.length, 3);
  assert.equal(batchCalls, 1, "three sealed groups within the 10-entry limit should ship in one SendMessageBatch call");
});

test("flushOnce sends nothing when the window buffer is empty", async () => {
  const publisher = require("./publisher");
  publisher.reset();
  let calls = 0;
  publisher.useClient({ send: async () => { calls += 1; return {}; } }, "eef-tower-agg");

  const messages = await flushOnce(createBuffer(), makeUnitTracker());
  assert.deepEqual(messages, []);
  assert.equal(calls, 0, "an empty flush should not touch the SQS client at all");
});
