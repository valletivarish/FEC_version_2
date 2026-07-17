"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toHiveReadingItem, composeHiveSortKey } = require("./transform");

test("composeHiveSortKey joins window_end and site_id with #", () => {
  assert.equal(composeHiveSortKey("2026-07-12T10:00:00.000Z", "apiary-b"), "2026-07-12T10:00:00.000Z#apiary-b");
});

test("toHiveReadingItem parses a JSON string message body", () => {
  const body = JSON.stringify({
    sensor_type: "hive_weight_kg",
    site_id: "apiary-a",
    unit: "kg",
    window_start: "s",
    window_end: "e",
    count: 4,
    min: 34,
    max: 36,
    avg: 35,
    latest: 35.5,
    alerts: [],
  });
  const item = toHiveReadingItem(body);
  assert.equal(item.sensor_type, "hive_weight_kg");
  assert.equal(item.sort_key, "e#apiary-a");
  assert.equal(item.avg, 35);
});

test("toHiveReadingItem accepts an already-parsed object body", () => {
  const item = toHiveReadingItem({ sensor_type: "internal_hive_temp_c", site_id: "apiary-b", window_end: "e2", avg: 37 });
  assert.equal(item.sort_key, "e2#apiary-b");
  assert.equal(item.site_id, "apiary-b");
});

test("toHiveReadingItem defaults site_id to apiary-a when absent", () => {
  const item = toHiveReadingItem({ sensor_type: "hive_weight_kg", window_end: "e3", avg: 30 });
  assert.equal(item.site_id, "apiary-a");
  assert.equal(item.sort_key, "e3#apiary-a");
});

test("toHiveReadingItem carries alerts through, defaulting to an empty array", () => {
  const withAlerts = toHiveReadingItem({ sensor_type: "internal_hive_temp_c", site_id: "apiary-a", window_end: "e4", avg: 37, alerts: ["brood_overheat_risk"] });
  assert.deepEqual(withAlerts.alerts, ["brood_overheat_risk"]);

  const withoutAlerts = toHiveReadingItem({ sensor_type: "internal_hive_temp_c", site_id: "apiary-a", window_end: "e5", avg: 34 });
  assert.deepEqual(withoutAlerts.alerts, []);
});

test("two apiaries in the same window produce distinct sort_keys for the same sensor_type", () => {
  const a = toHiveReadingItem({ sensor_type: "hive_weight_kg", site_id: "apiary-a", window_end: "same-end", avg: 35 });
  const b = toHiveReadingItem({ sensor_type: "hive_weight_kg", site_id: "apiary-b", window_end: "same-end", avg: 40 });
  assert.notEqual(a.sort_key, b.sort_key);
});
