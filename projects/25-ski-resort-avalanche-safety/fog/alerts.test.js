"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Rule, RULES, evaluateAlerts, THRESHOLD_TABLE } = require("./alerts");

test("RULES is a plain array of real Rule instances, built once at module load", () => {
  assert.ok(Array.isArray(RULES));
  for (const rule of RULES) {
    assert.ok(rule instanceof Rule);
    assert.equal(typeof rule.check, "function");
  }
});

test("a Rule instance checks itself against a summary via check()", () => {
  const rule = new Rule("avg", ">", 10, "too_high", "wind_speed_kmh");
  assert.equal(rule.check({ sensor_type: "wind_speed_kmh", avg: 11 }), true);
  assert.equal(rule.check({ sensor_type: "wind_speed_kmh", avg: 9 }), false);
});

test("a Rule instance never fires for a summary belonging to a different sensor_type", () => {
  const rule = new Rule("avg", ">", 10, "too_high", "wind_speed_kmh");
  assert.equal(rule.check({ sensor_type: "snow_temp_c", avg: 999 }), false);
});

test("seismic_vibration_mg fires avalanche_risk_detected when avg > 25", () => {
  assert.deepEqual(evaluateAlerts({ sensor_type: "seismic_vibration_mg", avg: 25.1 }), ["avalanche_risk_detected"]);
  assert.deepEqual(evaluateAlerts({ sensor_type: "seismic_vibration_mg", avg: 25.0 }), []);
});

test("wind_speed_kmh fires lift_wind_halt when avg > 80", () => {
  assert.deepEqual(evaluateAlerts({ sensor_type: "wind_speed_kmh", avg: 80.5 }), ["lift_wind_halt"]);
  assert.deepEqual(evaluateAlerts({ sensor_type: "wind_speed_kmh", avg: 80.0 }), []);
});

test("snow_temp_c fires snowpack_instability_risk when avg > 2", () => {
  assert.deepEqual(evaluateAlerts({ sensor_type: "snow_temp_c", avg: 2.1 }), ["snowpack_instability_risk"]);
  assert.deepEqual(evaluateAlerts({ sensor_type: "snow_temp_c", avg: 2.0 }), []);
});

test("snowpack_depth_cm fires insufficient_snow_coverage when avg < 30", () => {
  assert.deepEqual(evaluateAlerts({ sensor_type: "snowpack_depth_cm", avg: 29.9 }), ["insufficient_snow_coverage"]);
  assert.deepEqual(evaluateAlerts({ sensor_type: "snowpack_depth_cm", avg: 30.0 }), []);
});

test("lift_chair_count has no Rule instance and never alerts", () => {
  assert.deepEqual(evaluateAlerts({ sensor_type: "lift_chair_count", avg: 9999, max: 9999 }), []);
});

test("unknown sensor type returns no alerts rather than throwing", () => {
  assert.deepEqual(evaluateAlerts({ sensor_type: "unknown_sensor", avg: 100 }), []);
});

test("THRESHOLD_TABLE is descriptive metadata matching the exact brief thresholds", () => {
  assert.equal(THRESHOLD_TABLE.seismic_vibration_mg[0].limit, 25);
  assert.equal(THRESHOLD_TABLE.wind_speed_kmh[0].limit, 80);
  assert.equal(THRESHOLD_TABLE.snow_temp_c[0].limit, 2);
  assert.equal(THRESHOLD_TABLE.snowpack_depth_cm[0].limit, 30);
  assert.equal(THRESHOLD_TABLE.snowpack_depth_cm[0].op, "<");
  assert.deepEqual(THRESHOLD_TABLE.lift_chair_count, []);
});
