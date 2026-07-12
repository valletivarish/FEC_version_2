"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeWindow } = require("./aggregation");

test("summarizeWindow computes count/min/max/avg/latest for a single group", () => {
  const readings = [{ ts: "t0", value: 34.0 }, { ts: "t1", value: 34.8 }, { ts: "t2", value: 35.2 }];
  const summary = summarizeWindow("internal_hive_temp_c", "apiary-a", "C", readings, "s", "e");
  assert.equal(summary.sensor_type, "internal_hive_temp_c");
  assert.equal(summary.site_id, "apiary-a");
  assert.equal(summary.unit, "C");
  assert.equal(summary.count, 3);
  assert.equal(summary.min, 34.0);
  assert.equal(summary.max, 35.2);
  assert.equal(summary.avg, 34.667);
});

test("summarizeWindow's avg is rounded to 3 decimal places", () => {
  const readings = [{ ts: "t0", value: 1 }, { ts: "t1", value: 2 }, { ts: "t2", value: 2 }];
  const summary = summarizeWindow("hive_weight_kg", "apiary-a", "kg", readings, "s", "e");
  assert.equal(summary.avg, 1.667);
});

test("summarizeWindow's latest is the last reading in array order, not the max value", () => {
  const readings = [{ ts: "t0", value: 500 }, { ts: "t1", value: 10 }];
  const summary = summarizeWindow("acoustic_buzz_frequency_hz", "apiary-b", "Hz", readings, "s", "e");
  assert.equal(summary.latest, 10, "latest must reflect array order, not magnitude");
  assert.equal(summary.max, 500);
});

test("summarizeWindow handles a single reading (min == max == avg == latest)", () => {
  const summary = summarizeWindow("entrance_traffic_count", "apiary-a", "count", [{ ts: "t0", value: 150 }], "s", "e");
  assert.equal(summary.min, 150);
  assert.equal(summary.max, 150);
  assert.equal(summary.avg, 150);
  assert.equal(summary.latest, 150);
});

test("summarizeWindow carries window_start/window_end through unchanged", () => {
  const summary = summarizeWindow("internal_humidity_pct", "apiary-a", "%", [{ ts: "t0", value: 55 }], "start-iso", "end-iso");
  assert.equal(summary.window_start, "start-iso");
  assert.equal(summary.window_end, "end-iso");
});
