"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { RULES, evaluateAlerts, hasActiveAlert } = require("./alerts");

test("RULES is a plain object literal (not a Map, not a class instance)", () => {
  assert.equal(Object.getPrototypeOf(RULES), Object.prototype);
  assert.equal(RULES instanceof Map, false);
});

test("RULES covers exactly the 5 sensor types with 6 total rule entries", () => {
  assert.deepEqual(
    Object.keys(RULES).sort(),
    ["airflow_cfm", "dust_density_ugm3", "humidity_pct", "power_load_kw", "temperature_c"].sort()
  );
  const totalRules = Object.values(RULES).reduce((sum, rules) => sum + rules.length, 0);
  assert.equal(totalRules, 6, "humidity_pct carries 2 rules, the other 4 sensor types carry 1 each");
});

test("temperature_c: avg > 27 fires overheat_risk", () => {
  assert.deepEqual(evaluateAlerts("temperature_c", { avg: 27.1 }), ["overheat_risk"]);
  assert.deepEqual(evaluateAlerts("temperature_c", { avg: 27 }), []);
});

test("humidity_pct: avg > 60 fires condensation_risk, avg < 20 fires static_discharge_risk", () => {
  assert.deepEqual(evaluateAlerts("humidity_pct", { avg: 65 }), ["condensation_risk"]);
  assert.deepEqual(evaluateAlerts("humidity_pct", { avg: 15 }), ["static_discharge_risk"]);
  assert.deepEqual(evaluateAlerts("humidity_pct", { avg: 45 }), []);
});

test("airflow_cfm: avg < 400 fires insufficient_cooling", () => {
  assert.deepEqual(evaluateAlerts("airflow_cfm", { avg: 399.9 }), ["insufficient_cooling"]);
  assert.deepEqual(evaluateAlerts("airflow_cfm", { avg: 400 }), []);
});

test("power_load_kw: avg > 130 fires capacity_warning", () => {
  assert.deepEqual(evaluateAlerts("power_load_kw", { avg: 131 }), ["capacity_warning"]);
  assert.deepEqual(evaluateAlerts("power_load_kw", { avg: 130 }), []);
});

test("dust_density_ugm3: avg > 50 fires air_quality_risk", () => {
  assert.deepEqual(evaluateAlerts("dust_density_ugm3", { avg: 50.5 }), ["air_quality_risk"]);
  assert.deepEqual(evaluateAlerts("dust_density_ugm3", { avg: 50 }), []);
});

test("evaluateAlerts returns an empty array for an unknown sensor type", () => {
  assert.deepEqual(evaluateAlerts("unknown_sensor", { avg: 999 }), []);
});

test("hasActiveAlert agrees with evaluateAlerts on firing and non-firing summaries", () => {
  assert.equal(hasActiveAlert("temperature_c", { avg: 30 }), true);
  assert.equal(hasActiveAlert("temperature_c", { avg: 20 }), false);
  assert.equal(hasActiveAlert("unknown_sensor", { avg: 999 }), false);
});
