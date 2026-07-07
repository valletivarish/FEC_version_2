"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openAccumulator, fold, seal } = require("./accumulator");

test("fold tracks running count, sum, min, max, latest", () => {
  let acc = openAccumulator();
  acc = fold(acc, 10);
  acc = fold(acc, 4);
  acc = fold(acc, 7);
  assert.equal(acc.count, 3);
  assert.equal(acc.min, 4);
  assert.equal(acc.max, 10);
  assert.equal(acc.latest, 7);
});

test("seal computes avg and carries window metadata", () => {
  let acc = openAccumulator();
  acc = fold(acc, 6);
  acc = fold(acc, 9);
  const summary = seal(acc, {
    sensorType: "wind_speed_ms",
    siteId: "turbine-1",
    unit: "m/s",
    windowStart: "s",
    windowEnd: "e",
  });
  assert.equal(summary.avg, 7.5);
  assert.equal(summary.count, 2);
  assert.equal(summary.sensor_type, "wind_speed_ms");
  assert.equal(summary.site_id, "turbine-1");
  assert.equal(summary.window_start, "s");
  assert.equal(summary.window_end, "e");
});

test("seal reports latest as the most recently folded value", () => {
  let acc = openAccumulator();
  acc = fold(acc, 1);
  acc = fold(acc, 2);
  acc = fold(acc, 99);
  const summary = seal(acc, { sensorType: "x", siteId: "y", unit: "u", windowStart: "s", windowEnd: "e" });
  assert.equal(summary.latest, 99);
});
