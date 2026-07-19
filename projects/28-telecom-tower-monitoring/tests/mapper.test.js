import test from "node:test";
import assert from "node:assert/strict";
import { toItem } from "../backend/processor/mapper.js";

const window = {
  sensor_type: "battery_charge_pct",
  site_id: "site-south",
  unit: "%",
  window_start: "2026-01-01T00:00:00Z",
  window_end: "2026-01-01T00:00:10Z",
  count: 5, min: 40, max: 60, mean: 50, last: 48, spread: 20,
  alerts: ["battery_low"],
};

test("toItem builds a site-leading sort key", () => {
  const item = toItem(window);
  assert.equal(item.sensor_type, "battery_charge_pct");
  assert.equal(item.sort_key, "site-south#2026-01-01T00:00:10Z");
  assert.equal(item.site_id, "site-south");
});

test("toItem carries every aggregate field", () => {
  const item = toItem(window);
  for (const f of ["count", "min", "max", "mean", "last", "spread"]) {
    assert.equal(item[f], window[f]);
  }
  assert.deepEqual(item.alerts, ["battery_low"]);
});

test("toItem defaults missing alerts to an empty array", () => {
  const item = toItem({ ...window, alerts: undefined });
  assert.deepEqual(item.alerts, []);
});
