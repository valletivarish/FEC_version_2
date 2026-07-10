"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeWindow } = require("./aggregation");

test("summarizeWindow computes count/min/max/avg/latest", () => {
  const readings = [{ ts: "t0", value: 20 }, { ts: "t1", value: 30 }, { ts: "t2", value: 25 }];
  const summary = summarizeWindow("fill_level_pct", "district-a", "%", readings, "s", "e");
  assert.equal(summary.count, 3);
  assert.equal(summary.min, 20);
  assert.equal(summary.max, 30);
  assert.equal(summary.avg, 25);
  assert.equal(summary.latest, 25, "latest is last-in-order, not the max value");
});

test("summarizeWindow rounds avg to 3 decimal places", () => {
  const readings = [{ ts: "t0", value: 1 }, { ts: "t1", value: 2 }, { ts: "t2", value: 2 }];
  const summary = summarizeWindow("gas_level_ppm", "district-a", "ppm", readings, "s", "e");
  assert.equal(summary.avg, 1.667);
});

test("summarizeWindow carries sensor_type/site_id/unit/window bounds through", () => {
  const summary = summarizeWindow("bin_weight_kg", "district-b", "kg", [{ ts: "t0", value: 80 }], "2026-01-01T00:00:00Z", "2026-01-01T00:00:10Z");
  assert.equal(summary.sensor_type, "bin_weight_kg");
  assert.equal(summary.site_id, "district-b");
  assert.equal(summary.unit, "kg");
  assert.equal(summary.window_start, "2026-01-01T00:00:00Z");
  assert.equal(summary.window_end, "2026-01-01T00:00:10Z");
});

test("summarizeWindow with a single reading has min == max == avg == latest", () => {
  const summary = summarizeWindow("lid_open_count", "district-a", "count", [{ ts: "t0", value: 4 }], "s", "e");
  assert.equal(summary.min, 4);
  assert.equal(summary.max, 4);
  assert.equal(summary.avg, 4);
  assert.equal(summary.latest, 4);
});
