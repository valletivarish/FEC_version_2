"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { processRecords } = require("./handler");

class FakeDocClient {
  constructor() {
    this.puts = [];
  }

  async send(command) {
    this.puts.push(command.input);
    return {};
  }
}

test("processRecords writes one item per SQS record", async () => {
  const doc = new FakeDocClient();
  const records = [
    { body: JSON.stringify({ sensor_type: "heart_rate", window_end: "e1", site_id: "patient-1" }) },
    { body: JSON.stringify({ sensor_type: "spo2", window_end: "e1", site_id: "patient-2" }) },
  ];
  const count = await processRecords(records, doc, "fpv-readings");
  assert.equal(count, 2);
  assert.equal(doc.puts.length, 2);
  assert.equal(doc.puts[0].TableName, "fpv-readings");
  assert.equal(doc.puts[0].Item.sort_key, "e1#patient-1");
  assert.equal(doc.puts[1].Item.sort_key, "e1#patient-2");
});

test("processRecords returns zero for an empty batch", async () => {
  const doc = new FakeDocClient();
  const count = await processRecords([], doc, "fpv-readings");
  assert.equal(count, 0);
  assert.equal(doc.puts.length, 0);
});
