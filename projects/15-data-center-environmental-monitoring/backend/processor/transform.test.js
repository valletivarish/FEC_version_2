"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toItem, buildSortKey } = require("./transform");

test("buildSortKey concatenates window_end and site_id with a # separator", () => {
  assert.equal(buildSortKey("2026-01-01T00:00:10Z", "hall-2"), "2026-01-01T00:00:10Z#hall-2");
});

test("buildSortKey disambiguates two halls sharing the same window_end", () => {
  const a = buildSortKey("2026-01-01T00:00:10Z", "hall-1");
  const b = buildSortKey("2026-01-01T00:00:10Z", "hall-2");
  assert.notEqual(a, b);
});

test("toItem accepts a JSON string SQS message body and parses it", () => {
  const body = JSON.stringify({
    sensor_type: "temperature_c",
    site_id: "hall-1",
    unit: "C",
    window_start: "s",
    window_end: "e",
    count: 4,
    min: 20,
    max: 24,
    avg: 22,
    latest: 21,
    alerts: [],
  });
  const item = toItem(body);
  assert.equal(item.sensor_type, "temperature_c");
  assert.equal(item.sort_key, "e#hall-1");
});

test("toItem also accepts an already-parsed object body (SQS test-event style)", () => {
  const item = toItem({ sensor_type: "power_load_kw", site_id: "hall-2", window_end: "e2", avg: 140, alerts: ["capacity_warning"] });
  assert.equal(item.sort_key, "e2#hall-2");
  assert.deepEqual(item.alerts, ["capacity_warning"]);
});

test("toItem defaults site_id to hall-1 and unit to an empty string when absent", () => {
  const item = toItem({ sensor_type: "humidity_pct", window_end: "e3", avg: 45 });
  assert.equal(item.site_id, "hall-1");
  assert.equal(item.unit, "");
  assert.equal(item.sort_key, "e3#hall-1");
});

test("toItem carries count/min/max/avg/latest straight through", () => {
  const item = toItem({ sensor_type: "airflow_cfm", site_id: "hall-1", window_end: "e4", count: 5, min: 800, max: 950, avg: 890.5, latest: 900 });
  assert.equal(item.count, 5);
  assert.equal(item.min, 800);
  assert.equal(item.max, 950);
  assert.equal(item.avg, 890.5);
  assert.equal(item.latest, 900);
});
