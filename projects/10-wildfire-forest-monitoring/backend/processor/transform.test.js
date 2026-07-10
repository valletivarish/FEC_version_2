"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toItem, buildSortKey } = require("./transform");

test("buildSortKey composes window_end and site_id", () => {
  assert.equal(buildSortKey("2026-07-05T10:00:00Z", "station-2"), "2026-07-05T10:00:00Z#station-2");
});

test("toItem parses a JSON string message body", () => {
  const body = JSON.stringify({
    sensor_type: "smoke_density_ppm",
    site_id: "station-2",
    unit: "ppm",
    window_start: "s",
    window_end: "e",
    count: 4,
    min: 100,
    max: 200,
    avg: 160,
    latest: 180,
    alerts: ["fire_detected"],
  });
  const item = toItem(body);
  assert.equal(item.sort_key, "e#station-2");
  assert.equal(item.sensor_type, "smoke_density_ppm");
  assert.equal(item.avg, 160);
  assert.deepEqual(item.alerts, ["fire_detected"]);
});

test("toItem accepts an already-parsed object", () => {
  const item = toItem({ sensor_type: "wind_speed_kmh", window_end: "e2", site_id: "station-1" });
  assert.equal(item.sort_key, "e2#station-1");
  assert.deepEqual(item.alerts, []);
});

test("toItem defaults site_id to station-1 when absent", () => {
  const item = toItem({ sensor_type: "wind_speed_kmh", window_end: "e3" });
  assert.equal(item.site_id, "station-1");
  assert.equal(item.sort_key, "e3#station-1");
});

test("toItem disambiguates two sites sharing a window_end", () => {
  const a = toItem({ sensor_type: "wind_speed_kmh", window_end: "same", site_id: "station-1" });
  const b = toItem({ sensor_type: "wind_speed_kmh", window_end: "same", site_id: "station-2" });
  assert.notEqual(a.sort_key, b.sort_key);
});
