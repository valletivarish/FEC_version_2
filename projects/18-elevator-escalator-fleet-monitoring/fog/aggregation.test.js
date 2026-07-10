"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeWindow } = require("./aggregation");

test("summarizeWindow computes count/min/max/avg/latest over the window", () => {
  const readings = [{ ts: "t0", value: 30 }, { ts: "t1", value: 90 }, { ts: "t2", value: 60 }];
  const summary = summarizeWindow("motor_temp_c", "tower-a", "C", readings, "start", "end");
  assert.equal(summary.count, 3);
  assert.equal(summary.min, 30);
  assert.equal(summary.max, 90);
  assert.equal(summary.avg, 60);
});

test("latest is the last-in-order reading, not the maximum value", () => {
  const readings = [{ ts: "t0", value: 95 }, { ts: "t1", value: 40 }];
  const summary = summarizeWindow("motor_temp_c", "tower-a", "C", readings, "start", "end");
  assert.equal(summary.latest, 40, "latest must be the last reading in arrival order, not the max");
});

test("avg is rounded to 3 decimal places", () => {
  const readings = [{ ts: "t0", value: 1 }, { ts: "t1", value: 2 }, { ts: "t2", value: 2 }];
  const summary = summarizeWindow("cab_vibration_mm", "tower-a", "mm", readings, "start", "end");
  assert.equal(summary.avg, 1.667);
});

test("summary carries sensor_type/site_id/unit/window bounds through unchanged", () => {
  const summary = summarizeWindow(
    "load_weight_kg",
    "tower-b",
    "kg",
    [{ ts: "t0", value: 400 }],
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:10Z"
  );
  assert.equal(summary.sensor_type, "load_weight_kg");
  assert.equal(summary.site_id, "tower-b");
  assert.equal(summary.unit, "kg");
  assert.equal(summary.window_start, "2026-01-01T00:00:00Z");
  assert.equal(summary.window_end, "2026-01-01T00:00:10Z");
});

test("a single reading window has min === max === avg === latest", () => {
  const summary = summarizeWindow("travel_speed_mps", "tower-a", "m/s", [{ ts: "t0", value: 1.5 }], "s", "e");
  assert.equal(summary.min, 1.5);
  assert.equal(summary.max, 1.5);
  assert.equal(summary.avg, 1.5);
  assert.equal(summary.latest, 1.5);
});
