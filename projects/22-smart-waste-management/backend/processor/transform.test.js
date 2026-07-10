"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toItem, buildSortKey } = require("./transform");

test("buildSortKey joins window_end and site_id with #", () => {
  assert.equal(buildSortKey("2026-07-10T12:00:00Z", "district-b"), "2026-07-10T12:00:00Z#district-b");
});

test("toItem derives sort_key and defaults site_id to district-a when absent", () => {
  const item = toItem({ sensor_type: "fill_level_pct", window_end: "e1", window_start: "s1", avg: 90 });
  assert.equal(item.site_id, "district-a");
  assert.equal(item.sort_key, "e1#district-a");
});

test("toItem parses a JSON string message body", () => {
  const item = toItem(JSON.stringify({ sensor_type: "gas_level_ppm", site_id: "district-b", window_end: "e2", avg: 410, alerts: ["odor_gas_exceedance"] }));
  assert.equal(item.sensor_type, "gas_level_ppm");
  assert.equal(item.sort_key, "e2#district-b");
  assert.deepEqual(item.alerts, ["odor_gas_exceedance"]);
});

test("toItem preserves numeric fields and defaults unit/alerts", () => {
  const item = toItem({ sensor_type: "bin_weight_kg", site_id: "district-a", window_end: "e3", count: 4, min: 70, max: 90, avg: 80.5, latest: 82 });
  assert.equal(item.count, 4);
  assert.equal(item.min, 70);
  assert.equal(item.max, 90);
  assert.equal(item.avg, 80.5);
  assert.equal(item.latest, 82);
  assert.equal(item.unit, "");
  assert.deepEqual(item.alerts, []);
});

test("distinct districts in the same window never collide on sort_key", () => {
  const itemA = toItem({ sensor_type: "fill_level_pct", site_id: "district-a", window_end: "2026-07-10T12:00:10Z", avg: 40 });
  const itemB = toItem({ sensor_type: "fill_level_pct", site_id: "district-b", window_end: "2026-07-10T12:00:10Z", avg: 60 });
  assert.notEqual(itemA.sort_key, itemB.sort_key);
});
