import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, thresholds, RULES } from "../fog/alarms.js";

function agg(sensor_type, over) {
  return { sensor_type, min: 50, max: 50, mean: 50, last: 50, spread: 0, ...over };
}

test("battery fires low on the mean and critical on the minimum", () => {
  assert.deepEqual(evaluate(agg("battery_charge_pct", { mean: 25, min: 20 })), ["battery_low"]);
  assert.deepEqual(evaluate(agg("battery_charge_pct", { mean: 25, min: 12 })).sort(), ["battery_critical", "battery_low"]);
});

test("battery within band raises nothing", () => {
  assert.deepEqual(evaluate(agg("battery_charge_pct", { mean: 55, min: 50 })), []);
});

test("genset refuel trips below 20 percent mean", () => {
  assert.deepEqual(evaluate(agg("genset_fuel_pct", { mean: 18 })), ["refuel_required"]);
  assert.deepEqual(evaluate(agg("genset_fuel_pct", { mean: 22 })), []);
});

test("cabinet thermal alarm trips on the window maximum", () => {
  assert.deepEqual(evaluate(agg("cabinet_temp_c", { max: 47, mean: 30 })), ["thermal_alarm"]);
  assert.deepEqual(evaluate(agg("cabinet_temp_c", { max: 44, mean: 30 })), []);
});

test("dc overcurrent trips on the window maximum", () => {
  assert.deepEqual(evaluate(agg("dc_load_amps", { max: 60 })), ["overcurrent"]);
  assert.deepEqual(evaluate(agg("dc_load_amps", { max: 50 })), []);
});

test("rf saturation trips on the mean", () => {
  assert.deepEqual(evaluate(agg("rf_utilization_pct", { mean: 93 })), ["capacity_saturation"]);
  assert.deepEqual(evaluate(agg("rf_utilization_pct", { mean: 80 })), []);
});

test("an unknown signal has no rules", () => {
  assert.deepEqual(evaluate(agg("humidity", {})), []);
});

test("thresholds descriptor lists every rule per signal", () => {
  const t = thresholds();
  assert.equal(Object.keys(t).length, Object.keys(RULES).length);
  assert.equal(t.battery_charge_pct.length, 2);
  assert.ok(t.cabinet_temp_c[0].on.includes("max"));
});
