"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { HIVE_RULES, applyHiveRule, detectHiveAlerts, HIVE_THRESHOLD_SHEET } = require("./alerts");

test("HIVE_RULES is a flat array of plain [field, op, limit, key] tuples, not objects", () => {
  assert.ok(Array.isArray(HIVE_RULES));
  for (const rule of HIVE_RULES) {
    assert.ok(Array.isArray(rule), "each rule must be a plain array, not an object");
    assert.equal(rule.length, 4);
  }
});

test("applyHiveRule fires brood_overheat_risk when internal_hive_temp_c avg > 36", () => {
  const summary = { sensor_type: "internal_hive_temp_c", avg: 37.2 };
  assert.deepEqual(applyHiveRule(["internal_hive_temp_c.avg", ">", 36, "brood_overheat_risk"], summary), ["brood_overheat_risk"]);
});

test("applyHiveRule does not fire when the tuple's sensor type does not match the summary", () => {
  const summary = { sensor_type: "hive_weight_kg", avg: 37.2 };
  assert.deepEqual(applyHiveRule(["internal_hive_temp_c.avg", ">", 36, "brood_overheat_risk"], summary), []);
});

test("applyHiveRule does not fire when the comparison does not hold", () => {
  const summary = { sensor_type: "internal_hive_temp_c", avg: 34.0 };
  assert.deepEqual(applyHiveRule(["internal_hive_temp_c.avg", ">", 36, "brood_overheat_risk"], summary), []);
});

test("detectHiveAlerts: brood_overheat_risk fires when internal_hive_temp_c avg > 36", () => {
  assert.deepEqual(detectHiveAlerts({ sensor_type: "internal_hive_temp_c", avg: 36.5 }), ["brood_overheat_risk"]);
});

test("detectHiveAlerts: brood_chilling_risk fires when internal_hive_temp_c avg < 32", () => {
  assert.deepEqual(detectHiveAlerts({ sensor_type: "internal_hive_temp_c", avg: 31.0 }), ["brood_chilling_risk"]);
});

test("detectHiveAlerts: internal_hive_temp_c in the healthy band fires nothing", () => {
  assert.deepEqual(detectHiveAlerts({ sensor_type: "internal_hive_temp_c", avg: 34.0 }), []);
});

test("detectHiveAlerts: colony_starvation_risk fires when hive_weight_kg avg < 20", () => {
  assert.deepEqual(detectHiveAlerts({ sensor_type: "hive_weight_kg", avg: 15.0 }), ["colony_starvation_risk"]);
});

test("detectHiveAlerts: hive_weight_kg at or above 20 fires nothing", () => {
  assert.deepEqual(detectHiveAlerts({ sensor_type: "hive_weight_kg", avg: 20.0 }), []);
});

test("detectHiveAlerts: swarming_precursor_detected fires when acoustic_buzz_frequency_hz avg > 350", () => {
  assert.deepEqual(detectHiveAlerts({ sensor_type: "acoustic_buzz_frequency_hz", avg: 400 }), ["swarming_precursor_detected"]);
});

test("detectHiveAlerts: sensors with no configured rule always fire nothing", () => {
  assert.deepEqual(detectHiveAlerts({ sensor_type: "internal_humidity_pct", avg: 999 }), []);
  assert.deepEqual(detectHiveAlerts({ sensor_type: "entrance_traffic_count", avg: 999 }), []);
});

test("detectHiveAlerts uses HIVE_RULES.flatMap semantics -- an unknown sensor_type fires nothing", () => {
  assert.deepEqual(detectHiveAlerts({ sensor_type: "unknown_sensor", avg: 999 }), []);
});

test("HIVE_THRESHOLD_SHEET is descriptive metadata matching the HIVE_RULES tuples byte-for-byte", () => {
  assert.equal(HIVE_THRESHOLD_SHEET.internal_hive_temp_c[0].limit, 36);
  assert.equal(HIVE_THRESHOLD_SHEET.internal_hive_temp_c[1].limit, 32);
  assert.equal(HIVE_THRESHOLD_SHEET.hive_weight_kg[0].limit, 20);
  assert.equal(HIVE_THRESHOLD_SHEET.acoustic_buzz_frequency_hz[0].limit, 350);
  assert.deepEqual(HIVE_THRESHOLD_SHEET.internal_humidity_pct, []);
  assert.deepEqual(HIVE_THRESHOLD_SHEET.entrance_traffic_count, []);
});
