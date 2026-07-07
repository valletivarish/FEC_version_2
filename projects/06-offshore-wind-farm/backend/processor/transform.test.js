"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toItem, buildSortKey } = require("./transform");

test("buildSortKey composes window_end and site_id", () => {
  assert.equal(buildSortKey("2026-07-05T10:00:00Z", "turbine-2"), "2026-07-05T10:00:00Z#turbine-2");
});

test("toItem parses a JSON string message body", () => {
  const body = JSON.stringify({
    sensor_type: "generator_temp_c",
    site_id: "turbine-2",
    unit: "C",
    window_start: "s",
    window_end: "e",
    count: 4,
    min: 50,
    max: 70,
    avg: 60,
    latest: 65,
    alerts: ["generator_overheat"],
  });
  const item = toItem(body);
  assert.equal(item.sort_key, "e#turbine-2");
  assert.equal(item.sensor_type, "generator_temp_c");
  assert.equal(item.avg, 60);
  assert.deepEqual(item.alerts, ["generator_overheat"]);
});

test("toItem accepts an already-parsed object", () => {
  const item = toItem({ sensor_type: "wind_speed_ms", window_end: "e2", site_id: "turbine-1" });
  assert.equal(item.sort_key, "e2#turbine-1");
  assert.deepEqual(item.alerts, []);
});

test("toItem defaults site_id to turbine-1 when absent", () => {
  const item = toItem({ sensor_type: "wind_speed_ms", window_end: "e3" });
  assert.equal(item.site_id, "turbine-1");
  assert.equal(item.sort_key, "e3#turbine-1");
});

test("toItem disambiguates two sites sharing a window_end", () => {
  const a = toItem({ sensor_type: "wind_speed_ms", window_end: "same", site_id: "turbine-1" });
  const b = toItem({ sensor_type: "wind_speed_ms", window_end: "same", site_id: "turbine-2" });
  assert.notEqual(a.sort_key, b.sort_key);
});
