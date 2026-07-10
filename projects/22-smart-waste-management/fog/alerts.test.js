"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateAlerts, THRESHOLD_TABLE } = require("./alerts");

test("fill_level_pct fires collection_needed when avg > 85", () => {
  assert.deepEqual(evaluateAlerts("fill_level_pct", { avg: 86, max: 86 }), ["collection_needed"]);
  assert.deepEqual(evaluateAlerts("fill_level_pct", { avg: 85, max: 85 }), []);
});

test("internal_temp_c fires fire_risk_warning when avg > 55", () => {
  assert.deepEqual(evaluateAlerts("internal_temp_c", { avg: 55.1 }), ["fire_risk_warning"]);
  assert.deepEqual(evaluateAlerts("internal_temp_c", { avg: 55 }), []);
});

test("gas_level_ppm fires odor_gas_exceedance when avg > 400", () => {
  assert.deepEqual(evaluateAlerts("gas_level_ppm", { avg: 401 }), ["odor_gas_exceedance"]);
  assert.deepEqual(evaluateAlerts("gas_level_ppm", { avg: 400 }), []);
});

test("lid_open_count fires tamper_suspected on max > 8, not avg", () => {
  assert.deepEqual(evaluateAlerts("lid_open_count", { avg: 1, max: 9 }), ["tamper_suspected"]);
  assert.deepEqual(evaluateAlerts("lid_open_count", { avg: 9, max: 8 }), [], "avg alone must not trigger this rule");
});

test("bin_weight_kg never fires -- informational only, falls through to default", () => {
  assert.deepEqual(evaluateAlerts("bin_weight_kg", { avg: 10000, max: 10000 }), []);
});

test("an unknown sensor_type falls through to the default branch with no alerts", () => {
  assert.deepEqual(evaluateAlerts("unknown_sensor", { avg: 999, max: 999 }), []);
});

test("THRESHOLD_TABLE exactly matches the evaluated limits byte-for-byte", () => {
  assert.equal(THRESHOLD_TABLE.fill_level_pct[0].limit, 85);
  assert.equal(THRESHOLD_TABLE.internal_temp_c[0].limit, 55);
  assert.equal(THRESHOLD_TABLE.gas_level_ppm[0].limit, 400);
  assert.equal(THRESHOLD_TABLE.lid_open_count[0].field, "max");
  assert.equal(THRESHOLD_TABLE.lid_open_count[0].limit, 8);
  assert.deepEqual(THRESHOLD_TABLE.bin_weight_kg, []);
});

test("THRESHOLD_TABLE covers exactly the 5 sensor types", () => {
  assert.deepEqual(
    Object.keys(THRESHOLD_TABLE).sort(),
    ["bin_weight_kg", "fill_level_pct", "gas_level_ppm", "internal_temp_c", "lid_open_count"].sort()
  );
});
