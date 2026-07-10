"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { writeBatch, handler } = require("./handler");

function fakeMessage(sensorType, siteId, windowEnd, avg) {
  return {
    body: JSON.stringify({
      sensor_type: sensorType,
      site_id: siteId,
      unit: "x",
      window_start: "s",
      window_end: windowEnd,
      count: 3,
      min: avg - 1,
      max: avg + 1,
      avg,
      latest: avg,
      alerts: [],
    }),
  };
}

test("writeBatch writes one PutCommand per record", async () => {
  const puts = [];
  const doc = { send: async (command) => { puts.push(command); return {}; } };
  const records = [
    fakeMessage("turbidity_ntu", "plant-1", "e1", 3.0),
    fakeMessage("ph_level", "plant-2", "e1", 7.1),
  ];
  const written = await writeBatch(records, doc, "wtu-readings");
  assert.equal(written, 2);
  assert.equal(puts.length, 2);
  assert.equal(puts[0].input.TableName, "wtu-readings");
});

test("writeBatch derives the correct sort_key per item", async () => {
  const puts = [];
  const doc = { send: async (command) => { puts.push(command); return {}; } };
  await writeBatch([fakeMessage("pressure_bar", "plant-2", "2026-07-10T12:00:00Z", 1.9)], doc, "wtu-readings");
  assert.equal(puts[0].input.Item.sort_key, "2026-07-10T12:00:00Z#plant-2");
});

test("writeBatch returns 0 for an empty record list without calling send", async () => {
  let called = false;
  const doc = { send: async () => { called = true; return {}; } };
  const written = await writeBatch([], doc, "wtu-readings");
  assert.equal(written, 0);
  assert.equal(called, false);
});

test("handler.exports.handler processes event.Records via the injected document client shape", async () => {
  // handler.handler builds its own documentClient() lazily from env vars, so
  // this only exercises that it tolerates an empty Records array without
  // reaching out to AWS at all (no AWS_ENDPOINT_URL/AWS_ACCESS_KEY_ID set in
  // the test environment).
  const result = await handler({ Records: [] });
  assert.deepEqual(result, { written: 0 });
});

test("writeBatch preserves plant-specific numeric fields exactly", async () => {
  const puts = [];
  const doc = { send: async (command) => { puts.push(command); return {}; } };
  await writeBatch([fakeMessage("chlorine_ppm", "plant-1", "e", 0.15)], doc, "wtu-readings");
  assert.equal(puts[0].input.Item.avg, 0.15);
  assert.equal(puts[0].input.Item.sensor_type, "chlorine_ppm");
});
