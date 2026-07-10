"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateAlerts, THRESHOLD_TABLE, RULES } = require("./alerts");

test("temperature avg over 42C raises extreme_heat", () => {
  assert.deepEqual(evaluateAlerts("temperature_c", { avg: 43.1 }), ["extreme_heat"]);
  assert.deepEqual(evaluateAlerts("temperature_c", { avg: 42.0 }), []);
});

test("smoke density avg over 150ppm raises fire_detected", () => {
  assert.deepEqual(evaluateAlerts("smoke_density_ppm", { avg: 151 }), ["fire_detected"]);
  assert.deepEqual(evaluateAlerts("smoke_density_ppm", { avg: 150 }), []);
});

test("wind speed avg over 60km/h raises high_wind_warning", () => {
  assert.deepEqual(evaluateAlerts("wind_speed_kmh", { avg: 61 }), ["high_wind_warning"]);
  assert.deepEqual(evaluateAlerts("wind_speed_kmh", { avg: 60 }), []);
});

test("soil moisture avg under 10% raises drought_risk", () => {
  assert.deepEqual(evaluateAlerts("soil_moisture_pct", { avg: 9.9 }), ["drought_risk"]);
  assert.deepEqual(evaluateAlerts("soil_moisture_pct", { avg: 10 }), []);
});

test("humidity has no alert rule", () => {
  assert.deepEqual(evaluateAlerts("humidity_pct", { avg: 3 }), []);
});

test("unknown sensor type raises nothing", () => {
  assert.deepEqual(evaluateAlerts("mystery_metric", { avg: 999 }), []);
});

test("RULES is a flat array of rule-descriptor objects, not a lookup table", () => {
  assert.ok(Array.isArray(RULES));
  for (const rule of RULES) {
    assert.equal(typeof rule.sensorType, "string");
    assert.equal(typeof rule.key, "string");
    assert.equal(typeof rule.test, "function");
  }
});

test("THRESHOLD_TABLE describes every alert rule for /thresholds and matches hard limits", () => {
  assert.equal(THRESHOLD_TABLE.temperature_c[0].limit, 42);
  assert.equal(THRESHOLD_TABLE.smoke_density_ppm[0].limit, 150);
  assert.equal(THRESHOLD_TABLE.wind_speed_kmh[0].limit, 60);
  assert.equal(THRESHOLD_TABLE.soil_moisture_pct[0].limit, 10);
  assert.deepEqual(THRESHOLD_TABLE.humidity_pct, []);
});
