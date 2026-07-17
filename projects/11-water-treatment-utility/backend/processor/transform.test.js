"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { windowToReadingItem, composePlantRangeKey } = require("./transform");

test("composePlantRangeKey concatenates window_end and site_id with a # separator", () => {
  assert.equal(composePlantRangeKey("2026-07-10T12:00:00.000Z", "plant-2"), "2026-07-10T12:00:00.000Z#plant-2");
});

test("composePlantRangeKey disambiguates two plants flushed in the same window", () => {
  const a = composePlantRangeKey("2026-07-10T12:00:00.000Z", "plant-1");
  const b = composePlantRangeKey("2026-07-10T12:00:00.000Z", "plant-2");
  assert.notEqual(a, b);
});

test("windowToReadingItem maps a fog window message onto a DynamoDB item shape", () => {
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
  const item = windowToReadingItem(message);
  assert.equal(item.sensor_type, "turbidity_ntu");
  assert.equal(item.sort_key, "2026-07-10T12:00:00.000Z#plant-1");
  assert.equal(item.avg, 3.4);
  assert.deepEqual(item.alerts, ["turbidity_alert"]);
});

test("windowToReadingItem parses a JSON string message body (as delivered by SQS)", () => {
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
  const item = windowToReadingItem(raw);
  assert.equal(item.sort_key, "e#plant-2");
  assert.deepEqual(item.alerts, ["low_pressure_fault"]);
});

test("windowToReadingItem defaults alerts to an empty array and site_id to plant-1 when absent", () => {
  const item = windowToReadingItem({ sensor_type: "flow_rate_lps", window_end: "e", count: 1, min: 1, max: 1, avg: 1, latest: 1 });
  assert.deepEqual(item.alerts, []);
  assert.equal(item.site_id, "plant-1");
  assert.equal(item.sort_key, "e#plant-1");
});
