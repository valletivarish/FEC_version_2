"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { AlertEngine, engine, THRESHOLD_TABLE } = require("./alertEngine");

test("a fresh AlertEngine has no rules until registerRule is called", () => {
  const e = new AlertEngine();
  assert.deepEqual(e.evaluate("motor_temp_c", { avg: 999 }), []);
});

test("registerRule + evaluate fires only when the predicate returns true", () => {
  const e = new AlertEngine();
  e.registerRule("motor_temp_c", (summary) => summary.avg > 85, "motor_overheat_risk");
  assert.deepEqual(e.evaluate("motor_temp_c", { avg: 90 }), ["motor_overheat_risk"]);
  assert.deepEqual(e.evaluate("motor_temp_c", { avg: 50 }), []);
});

test("multiple rules registered for the same sensor type all get evaluated in order", () => {
  const e = new AlertEngine();
  e.registerRule("travel_speed_mps", (s) => s.avg < 0.5, "stall_suspected");
  e.registerRule("travel_speed_mps", (s) => s.max > 4, "overspeed_risk");
  assert.deepEqual(e.evaluate("travel_speed_mps", { avg: 0.2, max: 4.5 }), ["stall_suspected", "overspeed_risk"]);
});

test("the module-level engine matches the exact configured elevator/escalator thresholds", () => {
  assert.deepEqual(engine.evaluate("motor_temp_c", { avg: 86 }), ["motor_overheat_risk"]);
  assert.deepEqual(engine.evaluate("motor_temp_c", { avg: 85 }), [], "85 exactly must not fire, only > 85");
  assert.deepEqual(engine.evaluate("cab_vibration_mm", { avg: 6.1 }), ["ride_quality_fault"]);
  assert.deepEqual(engine.evaluate("cab_vibration_mm", { avg: 6 }), []);
  assert.deepEqual(engine.evaluate("load_weight_kg", { max: 1000.1, avg: 500 }), ["overload_warning"]);
  assert.deepEqual(engine.evaluate("load_weight_kg", { max: 1000, avg: 500 }), []);
  assert.deepEqual(engine.evaluate("travel_speed_mps", { avg: 0.49 }), ["stall_suspected"]);
  assert.deepEqual(engine.evaluate("travel_speed_mps", { avg: 0.5 }), []);
});

test("door_cycle_count has no registered rule", () => {
  assert.deepEqual(engine.evaluate("door_cycle_count", { avg: 999, max: 999 }), []);
  assert.deepEqual(engine.rulesFor("door_cycle_count"), []);
});

test("THRESHOLD_TABLE is descriptive metadata, independent of the live engine", () => {
  assert.equal(THRESHOLD_TABLE.motor_temp_c[0].limit, 85);
  assert.equal(THRESHOLD_TABLE.cab_vibration_mm[0].limit, 6);
  assert.equal(THRESHOLD_TABLE.load_weight_kg[0].field, "max");
  assert.equal(THRESHOLD_TABLE.load_weight_kg[0].limit, 1000);
  assert.equal(THRESHOLD_TABLE.travel_speed_mps[0].op, "<");
  assert.equal(THRESHOLD_TABLE.travel_speed_mps[0].limit, 0.5);
  assert.deepEqual(THRESHOLD_TABLE.door_cycle_count, []);
});
