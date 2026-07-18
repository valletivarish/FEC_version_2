"use strict";

// Rule engine: predicate closures registered per sensor type, evaluated against window aggregates (avg/max).
class AlertEngine {
  constructor() {
    this._rules = new Map();
  }

  registerRule(sensorType, predicateFn, key) {
    if (!this._rules.has(sensorType)) this._rules.set(sensorType, []);
    this._rules.get(sensorType).push({ predicateFn, key });
  }

  evaluate(sensorType, summary) {
    const rules = this._rules.get(sensorType) || [];
    const fired = [];
    for (const rule of rules) {
      if (rule.predicateFn(summary)) fired.push(rule.key);
    }
    return fired;
  }

  rulesFor(sensorType) {
    return this._rules.get(sensorType) || [];
  }
}

const engine = new AlertEngine();
engine.registerRule("motor_temp_c", (summary) => summary.avg > 85, "motor_overheat_risk");
engine.registerRule("cab_vibration_mm", (summary) => summary.avg > 6, "ride_quality_fault");
engine.registerRule("load_weight_kg", (summary) => summary.max > 1000, "overload_warning");
engine.registerRule("travel_speed_mps", (summary) => summary.avg < 0.5, "stall_suspected");
// door_cycle_count intentionally has no registered rule.

// Descriptive projection for the /thresholds endpoint; metadata only, never consulted by evaluate().
const THRESHOLD_TABLE = {
  motor_temp_c: [{ field: "avg", op: ">", limit: 85, key: "motor_overheat_risk" }],
  door_cycle_count: [],
  cab_vibration_mm: [{ field: "avg", op: ">", limit: 6, key: "ride_quality_fault" }],
  load_weight_kg: [{ field: "max", op: ">", limit: 1000, key: "overload_warning" }],
  travel_speed_mps: [{ field: "avg", op: "<", limit: 0.5, key: "stall_suspected" }],
};

module.exports = { AlertEngine, engine, THRESHOLD_TABLE };
