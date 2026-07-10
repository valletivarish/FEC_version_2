"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { writeBatch } = require("./handler");

function fakeDoc(onPut) {
  return {
    send: async (command) => {
      onPut(command.input);
      return {};
    },
  };
}

test("writeBatch writes one PutCommand per SQS record with the transformed item", async () => {
  const puts = [];
  const doc = fakeDoc((input) => puts.push(input));
  const records = [
    { body: JSON.stringify({ sensor_type: "temperature_c", site_id: "hall-1", window_end: "e1", avg: 22 }) },
    { body: JSON.stringify({ sensor_type: "temperature_c", site_id: "hall-2", window_end: "e1", avg: 24 }) },
  ];
  const written = await writeBatch(records, doc, "dce-readings");
  assert.equal(written, 2);
  assert.equal(puts.length, 2);
  assert.equal(puts[0].TableName, "dce-readings");
  assert.equal(puts[0].Item.sort_key, "e1#hall-1");
  assert.equal(puts[1].Item.sort_key, "e1#hall-2");
});

test("writeBatch returns 0 and issues no writes for an empty record batch", async () => {
  const puts = [];
  const doc = fakeDoc((input) => puts.push(input));
  const written = await writeBatch([], doc, "dce-readings");
  assert.equal(written, 0);
  assert.equal(puts.length, 0);
});

test("writeBatch propagates alerts through to the stored item", async () => {
  const puts = [];
  const doc = fakeDoc((input) => puts.push(input));
  const records = [
    { body: JSON.stringify({ sensor_type: "power_load_kw", site_id: "hall-1", window_end: "e2", avg: 140, alerts: ["capacity_warning"] }) },
  ];
  await writeBatch(records, doc, "dce-readings");
  assert.deepEqual(puts[0].Item.alerts, ["capacity_warning"]);
});
