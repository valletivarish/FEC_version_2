"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { persistHiveWindows, handler } = require("./handler");

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

test("persistHiveWindows writes one PutCommand per record", async () => {
  const puts = [];
  const apiaryDoc = { send: async (command) => { puts.push(command); return {}; } };
  const windows = [
    fakeMessage("hive_weight_kg", "apiary-a", "e1", 35.0),
    fakeMessage("internal_hive_temp_c", "apiary-b", "e1", 34.5),
  ];
  const stored = await persistHiveWindows(windows, apiaryDoc, "bam-readings");
  assert.equal(stored, 2);
  assert.equal(puts.length, 2);
  assert.equal(puts[0].input.TableName, "bam-readings");
});

test("persistHiveWindows derives the correct sort_key per item", async () => {
  const puts = [];
  const apiaryDoc = { send: async (command) => { puts.push(command); return {}; } };
  await persistHiveWindows([fakeMessage("acoustic_buzz_frequency_hz", "apiary-b", "2026-07-12T12:00:00Z", 360)], apiaryDoc, "bam-readings");
  assert.equal(puts[0].input.Item.sort_key, "2026-07-12T12:00:00Z#apiary-b");
});

test("persistHiveWindows returns 0 for an empty record list without calling send", async () => {
  let called = false;
  const apiaryDoc = { send: async () => { called = true; return {}; } };
  const stored = await persistHiveWindows([], apiaryDoc, "bam-readings");
  assert.equal(stored, 0);
  assert.equal(called, false);
});

test("handler processes event.Records and tolerates an empty batch without reaching AWS", async () => {
  const result = await handler({ Records: [] });
  assert.deepEqual(result, { written: 0 });
});

test("persistHiveWindows preserves apiary-specific numeric fields exactly", async () => {
  const puts = [];
  const apiaryDoc = { send: async (command) => { puts.push(command); return {}; } };
  await persistHiveWindows([fakeMessage("hive_weight_kg", "apiary-a", "e", 18.5)], apiaryDoc, "bam-readings");
  assert.equal(puts[0].input.Item.avg, 18.5);
  assert.equal(puts[0].input.Item.sensor_type, "hive_weight_kg");
});

test("persistHiveWindows carries alert keys through to the stored item", async () => {
  const puts = [];
  const apiaryDoc = { send: async (command) => { puts.push(command); return {}; } };
  const message = fakeMessage("hive_weight_kg", "apiary-a", "e", 15);
  message.body = JSON.stringify({ ...JSON.parse(message.body), alerts: ["colony_starvation_risk"] });
  await persistHiveWindows([message], apiaryDoc, "bam-readings");
  assert.deepEqual(puts[0].input.Item.alerts, ["colony_starvation_risk"]);
});
