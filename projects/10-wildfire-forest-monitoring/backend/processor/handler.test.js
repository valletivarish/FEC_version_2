"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { writeBatch } = require("./handler");

class FakeDoc {
  constructor() {
    this.items = [];
  }
  async send(command) {
    this.items.push(command.input);
    return {};
  }
}

test("writeBatch writes one PutCommand per SQS record", async () => {
  const doc = new FakeDoc();
  const records = [
    { body: JSON.stringify({ sensor_type: "wind_speed_kmh", window_end: "e1", site_id: "station-1" }) },
    { body: JSON.stringify({ sensor_type: "wind_speed_kmh", window_end: "e1", site_id: "station-2" }) },
  ];
  const written = await writeBatch(records, doc, "wfm-readings");
  assert.equal(written, 2);
  assert.equal(doc.items.length, 2);
  assert.equal(doc.items[0].TableName, "wfm-readings");
  assert.equal(doc.items[0].Item.sort_key, "e1#station-1");
  assert.equal(doc.items[1].Item.sort_key, "e1#station-2");
});

test("writeBatch is a no-op for an empty record list", async () => {
  const doc = new FakeDoc();
  const written = await writeBatch([], doc, "wfm-readings");
  assert.equal(written, 0);
  assert.equal(doc.items.length, 0);
});
