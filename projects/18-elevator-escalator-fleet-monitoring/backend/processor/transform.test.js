"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toItem, buildSortKey } = require("./transform");

test("buildSortKey concatenates window_end and site_id with a # separator", () => {
  assert.equal(buildSortKey("2026-07-10T12:00:00Z", "tower-b"), "2026-07-10T12:00:00Z#tower-b");
});

test("toItem maps every field from the aggregate payload onto the DynamoDB item shape", () => {
  const item = toItem({
    sensor_type: "motor_temp_c",
    site_id: "tower-a",
    unit: "C",
    window_start: "s",
    window_end: "e",
    count: 4,
    min: 50,
    max: 90,
    avg: 70,
    latest: 88,
    alerts: ["motor_overheat_risk"],
  });
  assert.equal(item.sensor_type, "motor_temp_c");
  assert.equal(item.sort_key, "e#tower-a");
  assert.equal(item.count, 4);
  assert.equal(item.max, 90);
  assert.deepEqual(item.alerts, ["motor_overheat_risk"]);
});

test("toItem parses a JSON string message body (the real SQS record shape)", () => {
  const item = toItem(JSON.stringify({ sensor_type: "cab_vibration_mm", site_id: "tower-b", window_end: "e2" }));
  assert.equal(item.sensor_type, "cab_vibration_mm");
  assert.equal(item.sort_key, "e2#tower-b");
});

test("toItem disambiguates tower-a and tower-b readings for the same sensor_type and window_end", () => {
  const towerA = toItem({ sensor_type: "load_weight_kg", site_id: "tower-a", window_end: "shared-window" });
  const towerB = toItem({ sensor_type: "load_weight_kg", site_id: "tower-b", window_end: "shared-window" });
  assert.notEqual(towerA.sort_key, towerB.sort_key);
});

test("toItem defaults alerts to an empty array and unit to an empty string when absent", () => {
  const item = toItem({ sensor_type: "door_cycle_count", site_id: "tower-a", window_end: "e" });
  assert.deepEqual(item.alerts, []);
  assert.equal(item.unit, "");
});
