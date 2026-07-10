"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeWindow } = require("./aggregation");

test("summarizeWindow computes count/min/max/avg/latest over the window", () => {
  const readings = [{ ts: "t0", value: 1.0 }, { ts: "t1", value: 3.0 }, { ts: "t2", value: 2.0 }];
  const summary = summarizeWindow("turbidity_ntu", "plant-1", "NTU", readings, "start", "end");
  assert.equal(summary.count, 3);
  assert.equal(summary.min, 1.0);
  assert.equal(summary.max, 3.0);
  assert.equal(summary.avg, 2.0);
});

test("latest is the last-in-order reading, not the maximum value", () => {
  const readings = [{ ts: "t0", value: 9.0 }, { ts: "t1", value: 1.0 }];
  const summary = summarizeWindow("chlorine_ppm", "plant-1", "ppm", readings, "start", "end");
  assert.equal(summary.latest, 1.0, "latest must be the last reading in arrival order, not the max");
});

test("avg is rounded to 3 decimal places", () => {
  const readings = [{ ts: "t0", value: 1 }, { ts: "t1", value: 2 }, { ts: "t2", value: 2 }];
  const summary = summarizeWindow("ph_level", "plant-1", "pH", readings, "start", "end");
  assert.equal(summary.avg, 1.667);
});

test("summary carries sensor_type/site_id/unit/window bounds through unchanged", () => {
  const summary = summarizeWindow("pressure_bar", "plant-2", "bar", [{ ts: "t0", value: 4 }], "2026-01-01T00:00:00Z", "2026-01-01T00:00:10Z");
  assert.equal(summary.sensor_type, "pressure_bar");
  assert.equal(summary.site_id, "plant-2");
  assert.equal(summary.unit, "bar");
  assert.equal(summary.window_start, "2026-01-01T00:00:00Z");
  assert.equal(summary.window_end, "2026-01-01T00:00:10Z");
});

test("a single reading window has min === max === avg === latest", () => {
  const summary = summarizeWindow("flow_rate_lps", "plant-1", "L/s", [{ ts: "t0", value: 60 }], "s", "e");
  assert.equal(summary.min, 60);
  assert.equal(summary.max, 60);
  assert.equal(summary.avg, 60);
  assert.equal(summary.latest, 60);
});
