"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PLANT_BREACH_RULES, buildBreachRule, breachesForWindow, THRESHOLD_CATALOG } = require("./alerts");

test("PLANT_BREACH_RULES is a real Map keyed by sensor type, built once at module load", () => {
  assert.ok(PLANT_BREACH_RULES instanceof Map);
  assert.ok(PLANT_BREACH_RULES.has("turbidity_ntu"));
  assert.equal(typeof PLANT_BREACH_RULES.get("turbidity_ntu"), "function");
});

test("buildBreachRule builds an independent closure per call, capturing its own limit", () => {
  const highRule = buildBreachRule("avg", ">", 10, "too_high");
  const lowRule = buildBreachRule("avg", "<", 2, "too_low");
  assert.deepEqual(highRule({ avg: 11 }), ["too_high"]);
  assert.deepEqual(highRule({ avg: 9 }), []);
  assert.deepEqual(lowRule({ avg: 1 }), ["too_low"]);
  assert.deepEqual(lowRule({ avg: 5 }), []);
});

test("turbidity_ntu fires turbidity_alert when avg > 5", () => {
  assert.deepEqual(breachesForWindow("turbidity_ntu", { avg: 5.1 }), ["turbidity_alert"]);
  assert.deepEqual(breachesForWindow("turbidity_ntu", { avg: 5.0 }), []);
});

test("chlorine_ppm fires under_chlorination when avg < 0.2", () => {
  assert.deepEqual(breachesForWindow("chlorine_ppm", { avg: 0.1 }), ["under_chlorination"]);
  assert.deepEqual(breachesForWindow("chlorine_ppm", { avg: 0.2 }), []);
});

test("pressure_bar fires low_pressure_fault when min < 2 (not avg)", () => {
  assert.deepEqual(breachesForWindow("pressure_bar", { min: 1.9, avg: 4.0 }), ["low_pressure_fault"]);
  assert.deepEqual(breachesForWindow("pressure_bar", { min: 2.0, avg: 1.0 }), [], "avg must not be consulted for this rule");
});

test("ph_level fires acidic_violation when avg < 6.5", () => {
  assert.deepEqual(breachesForWindow("ph_level", { avg: 6.4 }), ["acidic_violation"]);
  assert.deepEqual(breachesForWindow("ph_level", { avg: 6.5 }), []);
});

test("flow_rate_lps has no rule and never alerts", () => {
  assert.deepEqual(breachesForWindow("flow_rate_lps", { avg: 999, min: -999 }), []);
});

test("unknown sensor type returns no alerts rather than throwing", () => {
  assert.deepEqual(breachesForWindow("unknown_sensor", { avg: 100 }), []);
});

test("THRESHOLD_CATALOG is descriptive metadata matching the exact brief thresholds", () => {
  assert.equal(THRESHOLD_CATALOG.turbidity_ntu[0].limit, 5);
  assert.equal(THRESHOLD_CATALOG.ph_level[0].limit, 6.5);
  assert.equal(THRESHOLD_CATALOG.chlorine_ppm[0].limit, 0.2);
  assert.equal(THRESHOLD_CATALOG.pressure_bar[0].limit, 2);
  assert.equal(THRESHOLD_CATALOG.pressure_bar[0].field, "min");
  assert.deepEqual(THRESHOLD_CATALOG.flow_rate_lps, []);
});
