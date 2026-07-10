"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDoubleBuffer, bufferKey, addReading, swapAndDrain } = require("./doubleBuffer");

test("bufferKey joins sensorType and siteId with the delimiter", () => {
  assert.equal(bufferKey("fill_level_pct", "district-a"), "fill_level_pct::district-a");
});

test("addReading groups readings by (sensor_type, site_id) immediately at ingest", () => {
  const db = createDoubleBuffer();
  addReading(db, "fill_level_pct", "district-a", "%", { ts: "t0", value: 30 });
  addReading(db, "fill_level_pct", "district-a", "%", { ts: "t1", value: 35 });
  addReading(db, "fill_level_pct", "district-b", "%", { ts: "t0", value: 10 });
  assert.equal(db.active.get("fill_level_pct::district-a").length, 2);
  assert.equal(db.active.get("fill_level_pct::district-b").length, 1);
});

test("swapAndDrain returns one group per non-empty key with unit attached", () => {
  const db = createDoubleBuffer();
  addReading(db, "gas_level_ppm", "district-a", "ppm", { ts: "t0", value: 60 });
  const groups = swapAndDrain(db);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sensorType, "gas_level_ppm");
  assert.equal(groups[0].siteId, "district-a");
  assert.equal(groups[0].unit, "ppm");
  assert.deepEqual(groups[0].readings, [{ ts: "t0", value: 60 }]);
});

test("swapAndDrain installs a brand new empty active Map rather than clearing the old one in place", () => {
  const db = createDoubleBuffer();
  addReading(db, "bin_weight_kg", "district-a", "kg", { ts: "t0", value: 80 });
  const beforeSwapMap = db.active;
  const groups = swapAndDrain(db);
  assert.notEqual(db.active, beforeSwapMap, "active should now point at a different Map object");
  assert.equal(db.active.size, 0);
  // The old map handed to swapAndDrain's caller is left untouched (not
  // cleared) -- its entries are still readable, proving no in-place
  // mutation happened to the object being drained.
  assert.equal(beforeSwapMap.get("bin_weight_kg::district-a").length, 1);
  assert.equal(groups.length, 1);
});

test("a reading added after swapAndDrain lands in the new active buffer, not the drained one", () => {
  const db = createDoubleBuffer();
  addReading(db, "lid_open_count", "district-a", "count", { ts: "t0", value: 1 });
  const firstBatch = swapAndDrain(db);
  addReading(db, "lid_open_count", "district-a", "count", { ts: "t1", value: 2 });
  assert.equal(firstBatch.length, 1);
  assert.equal(firstBatch[0].readings.length, 1, "the drained batch is unaffected by writes that happen afterward");
  const secondBatch = swapAndDrain(db);
  assert.equal(secondBatch.length, 1);
  assert.equal(secondBatch[0].readings[0].value, 2);
});

test("swapAndDrain on an empty buffer returns no groups", () => {
  const db = createDoubleBuffer();
  assert.deepEqual(swapAndDrain(db), []);
});

test("keys with zero-length readings arrays (defensive) are skipped", () => {
  const db = createDoubleBuffer();
  db.active.set("internal_temp_c::district-a", []);
  assert.deepEqual(swapAndDrain(db), []);
});
