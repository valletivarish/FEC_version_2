"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toItem, buildSortKey } = require("./transform");

test("buildSortKey concatenates window_end and site_id with a # separator", () => {
  assert.equal(buildSortKey("2026-07-10T12:00:00.000Z", "plant-2"), "2026-07-10T12:00:00.000Z#plant-2");
});

test("buildSortKey disambiguates two plants flushed in the same window", () => {
  const a = buildSortKey("2026-07-10T12:00:00.000Z", "plant-1");
  const b = buildSortKey("2026-07-10T12:00:00.000Z", "plant-2");
  assert.notEqual(a, b);
});

test("toItem maps a fog window message onto a DynamoDB item shape", () => {
  const message = {
    sensor_type: "turbidity_ntu",
    site_id: "plant-1",
    unit: "NTU",
    window_start: "2026-07-10T11:59:50.000Z",
    window_end: "2026-07-10T12:00:00.000Z",
    count: 5,
    min: 1.1,
    max: 6.2,
    avg: 3.4,
    latest: 5.9,
    alerts: ["turbidity_alert"],
  };
  const item = toItem(message);
  assert.equal(item.sensor_type, "turbidity_ntu");
  assert.equal(item.sort_key, "2026-07-10T12:00:00.000Z#plant-1");
  assert.equal(item.avg, 3.4);
  assert.deepEqual(item.alerts, ["turbidity_alert"]);
});

test("toItem parses a JSON string message body (as delivered by SQS)", () => {
  const raw = JSON.stringify({
    sensor_type: "pressure_bar",
    site_id: "plant-2",
    unit: "bar",
    window_start: "s",
    window_end: "e",
    count: 1,
    min: 1.9,
    max: 1.9,
    avg: 1.9,
    latest: 1.9,
    alerts: ["low_pressure_fault"],
  });
  const item = toItem(raw);
  assert.equal(item.sort_key, "e#plant-2");
  assert.deepEqual(item.alerts, ["low_pressure_fault"]);
});

test("toItem defaults alerts to an empty array and site_id to plant-1 when absent", () => {
  const item = toItem({ sensor_type: "flow_rate_lps", window_end: "e", count: 1, min: 1, max: 1, avg: 1, latest: 1 });
  assert.deepEqual(item.alerts, []);
  assert.equal(item.site_id, "plant-1");
  assert.equal(item.sort_key, "e#plant-1");
});
