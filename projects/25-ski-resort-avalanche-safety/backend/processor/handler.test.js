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
    fakeMessage("seismic_vibration_mg", "slope-a", "e1", 3.0),
    fakeMessage("wind_speed_kmh", "slope-b", "e1", 25.0),
  ];
  const written = await writeBatch(records, doc, "ska-readings");
  assert.equal(written, 2);
  assert.equal(puts.length, 2);
  assert.equal(puts[0].input.TableName, "ska-readings");
});

test("writeBatch derives the correct sort_key per item", async () => {
  const puts = [];
  const doc = { send: async (command) => { puts.push(command); return {}; } };
  await writeBatch([fakeMessage("snow_temp_c", "slope-b", "2026-07-10T12:00:00Z", 1.9)], doc, "ska-readings");
  assert.equal(puts[0].input.Item.sort_key, "2026-07-10T12:00:00Z#slope-b");
});

test("writeBatch returns 0 for an empty record list without calling send", async () => {
  let called = false;
  const doc = { send: async () => { called = true; return {}; } };
  const written = await writeBatch([], doc, "ska-readings");
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

test("writeBatch preserves slope-specific numeric fields exactly", async () => {
  const puts = [];
  const doc = { send: async (command) => { puts.push(command); return {}; } };
  await writeBatch([fakeMessage("snowpack_depth_cm", "slope-a", "e", 28.5)], doc, "ska-readings");
  assert.equal(puts[0].input.Item.avg, 28.5);
  assert.equal(puts[0].input.Item.sensor_type, "snowpack_depth_cm");
});
