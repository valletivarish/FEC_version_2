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
    fakeMessage("hive_weight_kg", "apiary-a", "e1", 35.0),
    fakeMessage("internal_hive_temp_c", "apiary-b", "e1", 34.5),
  ];
  const written = await writeBatch(records, doc, "bam-readings");
  assert.equal(written, 2);
  assert.equal(puts.length, 2);
  assert.equal(puts[0].input.TableName, "bam-readings");
});

test("writeBatch derives the correct sort_key per item", async () => {
  const puts = [];
  const doc = { send: async (command) => { puts.push(command); return {}; } };
  await writeBatch([fakeMessage("acoustic_buzz_frequency_hz", "apiary-b", "2026-07-12T12:00:00Z", 360)], doc, "bam-readings");
  assert.equal(puts[0].input.Item.sort_key, "2026-07-12T12:00:00Z#apiary-b");
});

test("writeBatch returns 0 for an empty record list without calling send", async () => {
  let called = false;
  const doc = { send: async () => { called = true; return {}; } };
  const written = await writeBatch([], doc, "bam-readings");
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

test("writeBatch preserves apiary-specific numeric fields exactly", async () => {
  const puts = [];
  const doc = { send: async (command) => { puts.push(command); return {}; } };
  await writeBatch([fakeMessage("hive_weight_kg", "apiary-a", "e", 18.5)], doc, "bam-readings");
  assert.equal(puts[0].input.Item.avg, 18.5);
  assert.equal(puts[0].input.Item.sensor_type, "hive_weight_kg");
});

test("writeBatch carries alert keys through to the stored item", async () => {
  const puts = [];
  const doc = { send: async (command) => { puts.push(command); return {}; } };
  const message = fakeMessage("hive_weight_kg", "apiary-a", "e", 15);
  message.body = JSON.stringify({ ...JSON.parse(message.body), alerts: ["colony_starvation_risk"] });
  await writeBatch([message], doc, "bam-readings");
  assert.deepEqual(puts[0].input.Item.alerts, ["colony_starvation_risk"]);
});
