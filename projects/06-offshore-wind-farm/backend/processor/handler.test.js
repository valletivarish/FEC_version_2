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
    { body: JSON.stringify({ sensor_type: "wind_speed_ms", window_end: "e1", site_id: "turbine-1" }) },
    { body: JSON.stringify({ sensor_type: "wind_speed_ms", window_end: "e1", site_id: "turbine-2" }) },
  ];
  const written = await writeBatch(records, doc, "owf-readings");
  assert.equal(written, 2);
  assert.equal(doc.items.length, 2);
  assert.equal(doc.items[0].TableName, "owf-readings");
  assert.equal(doc.items[0].Item.sort_key, "e1#turbine-1");
  assert.equal(doc.items[1].Item.sort_key, "e1#turbine-2");
});

test("writeBatch is a no-op for an empty record list", async () => {
  const doc = new FakeDoc();
  const written = await writeBatch([], doc, "owf-readings");
  assert.equal(written, 0);
  assert.equal(doc.items.length, 0);
});
