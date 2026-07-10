"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ALERT_RULES, makeThreshold, evaluateAlerts, THRESHOLD_TABLE } = require("./alerts");

test("ALERT_RULES is a real Map keyed by sensor type, built once at module load", () => {
  assert.ok(ALERT_RULES instanceof Map);
  assert.ok(ALERT_RULES.has("turbidity_ntu"));
  assert.equal(typeof ALERT_RULES.get("turbidity_ntu"), "function");
});

test("makeThreshold builds an independent closure per call, capturing its own limit", () => {
  const highRule = makeThreshold("avg", ">", 10, "too_high");
  const lowRule = makeThreshold("avg", "<", 2, "too_low");
  assert.deepEqual(highRule({ avg: 11 }), ["too_high"]);
  assert.deepEqual(highRule({ avg: 9 }), []);
  assert.deepEqual(lowRule({ avg: 1 }), ["too_low"]);
  assert.deepEqual(lowRule({ avg: 5 }), []);
});

test("turbidity_ntu fires turbidity_alert when avg > 5", () => {
  assert.deepEqual(evaluateAlerts("turbidity_ntu", { avg: 5.1 }), ["turbidity_alert"]);
  assert.deepEqual(evaluateAlerts("turbidity_ntu", { avg: 5.0 }), []);
});

test("chlorine_ppm fires under_chlorination when avg < 0.2", () => {
  assert.deepEqual(evaluateAlerts("chlorine_ppm", { avg: 0.1 }), ["under_chlorination"]);
  assert.deepEqual(evaluateAlerts("chlorine_ppm", { avg: 0.2 }), []);
});

test("pressure_bar fires low_pressure_fault when min < 2 (not avg)", () => {
  assert.deepEqual(evaluateAlerts("pressure_bar", { min: 1.9, avg: 4.0 }), ["low_pressure_fault"]);
  assert.deepEqual(evaluateAlerts("pressure_bar", { min: 2.0, avg: 1.0 }), [], "avg must not be consulted for this rule");
});

test("ph_level fires acidic_violation when avg < 6.5", () => {
  assert.deepEqual(evaluateAlerts("ph_level", { avg: 6.4 }), ["acidic_violation"]);
  assert.deepEqual(evaluateAlerts("ph_level", { avg: 6.5 }), []);
});

test("flow_rate_lps has no rule and never alerts", () => {
  assert.deepEqual(evaluateAlerts("flow_rate_lps", { avg: 999, min: -999 }), []);
});

test("unknown sensor type returns no alerts rather than throwing", () => {
  assert.deepEqual(evaluateAlerts("unknown_sensor", { avg: 100 }), []);
});

test("THRESHOLD_TABLE is descriptive metadata matching the exact brief thresholds", () => {
  assert.equal(THRESHOLD_TABLE.turbidity_ntu[0].limit, 5);
  assert.equal(THRESHOLD_TABLE.ph_level[0].limit, 6.5);
  assert.equal(THRESHOLD_TABLE.chlorine_ppm[0].limit, 0.2);
  assert.equal(THRESHOLD_TABLE.pressure_bar[0].limit, 2);
  assert.equal(THRESHOLD_TABLE.pressure_bar[0].field, "min");
  assert.deepEqual(THRESHOLD_TABLE.flow_rate_lps, []);
});
