"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toItem, buildSortKey } = require("./transform");

test("buildSortKey concatenates window_end and site_id with a # separator", () => {
  assert.equal(buildSortKey("2026-07-10T12:00:00.000Z", "slope-b"), "2026-07-10T12:00:00.000Z#slope-b");
});

test("buildSortKey disambiguates two slopes flushed in the same window", () => {
  const a = buildSortKey("2026-07-10T12:00:00.000Z", "slope-a");
  const b = buildSortKey("2026-07-10T12:00:00.000Z", "slope-b");
  assert.notEqual(a, b);
});

test("toItem maps a fog window message onto a DynamoDB item shape", () => {
  const message = {
    sensor_type: "seismic_vibration_mg",
    site_id: "slope-a",
    unit: "milli-g",
    window_start: "2026-07-10T11:59:50.000Z",
    window_end: "2026-07-10T12:00:00.000Z",
    count: 5,
    min: 2.0,
    max: 30.1,
    avg: 26.4,
    latest: 30.1,
    alerts: ["avalanche_risk_detected"],
  };
  const item = toItem(message);
  assert.equal(item.sensor_type, "seismic_vibration_mg");
  assert.equal(item.sort_key, "2026-07-10T12:00:00.000Z#slope-a");
  assert.equal(item.avg, 26.4);
  assert.deepEqual(item.alerts, ["avalanche_risk_detected"]);
});

test("toItem parses a JSON string message body (as delivered by SQS)", () => {
  const raw = JSON.stringify({
    sensor_type: "wind_speed_kmh",
    site_id: "slope-b",
    unit: "km/h",
    window_start: "s",
    window_end: "e",
    count: 1,
    min: 82,
    max: 82,
    avg: 82,
    latest: 82,
    alerts: ["lift_wind_halt"],
  });
  const item = toItem(raw);
  assert.equal(item.sort_key, "e#slope-b");
  assert.deepEqual(item.alerts, ["lift_wind_halt"]);
});

test("toItem defaults alerts to an empty array and site_id to slope-a when absent", () => {
  const item = toItem({ sensor_type: "lift_chair_count", window_end: "e", count: 1, min: 1, max: 1, avg: 1, latest: 1 });
  assert.deepEqual(item.alerts, []);
  assert.equal(item.site_id, "slope-a");
  assert.equal(item.sort_key, "e#slope-a");
});
