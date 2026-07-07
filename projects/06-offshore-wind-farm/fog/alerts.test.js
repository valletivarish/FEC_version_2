"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inspect, THRESHOLD_TABLE } = require("./alerts");

test("blade vibration over 8mm avg raises structural_risk", () => {
  assert.deepEqual(inspect("blade_vibration_mm", { avg: 8.5 }), ["structural_risk"]);
  assert.deepEqual(inspect("blade_vibration_mm", { avg: 6.0 }), []);
});

test("generator temp over 95C avg raises generator_overheat", () => {
  assert.deepEqual(inspect("generator_temp_c", { avg: 96.2 }), ["generator_overheat"]);
  assert.deepEqual(inspect("generator_temp_c", { avg: 95.0 }), []);
});

test("wind speed over 25 m/s avg raises high_wind_shutdown_risk", () => {
  assert.deepEqual(inspect("wind_speed_ms", { avg: 27.4 }), ["high_wind_shutdown_risk"]);
});

test("gearbox pressure dipping under 2.5 bar min raises lubrication_fault", () => {
  assert.deepEqual(inspect("gearbox_pressure_bar", { min: 2.1, avg: 4.0 }), ["lubrication_fault"]);
  assert.deepEqual(inspect("gearbox_pressure_bar", { min: 3.0, avg: 4.0 }), []);
});

test("power output has no alert rule", () => {
  assert.deepEqual(inspect("power_output_kw", { avg: 3400 }), []);
});

test("unknown sensor type raises nothing", () => {
  assert.deepEqual(inspect("mystery_metric", { avg: 999, min: 999 }), []);
});

test("THRESHOLD_TABLE describes every alert rule for /thresholds", () => {
  assert.equal(THRESHOLD_TABLE.blade_vibration_mm[0].key, "structural_risk");
  assert.equal(THRESHOLD_TABLE.gearbox_pressure_bar[0].field, "min");
  assert.deepEqual(THRESHOLD_TABLE.power_output_kw, []);
});
