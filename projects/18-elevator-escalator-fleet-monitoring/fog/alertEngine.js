"use strict";

// OOP rule engine: AlertEngine registers plain predicate closures via registerRule() at module load, evaluated only against window aggregates (avg/max), never raw readings -- the 5th distinct alert-rule idiom in this portfolio's JS fog services.
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
// door_cycle_count intentionally has no registered rule -- evaluate() falls
// through to the empty-array branch for it.

// Purely descriptive projection for the /thresholds endpoint. This table is
// metadata only and is never consulted by AlertEngine.evaluate(), which
// always goes through the registered predicate closures above -- the same
// disclosure-vs-evaluation split used across this portfolio's fog services.
const THRESHOLD_TABLE = {
  motor_temp_c: [{ field: "avg", op: ">", limit: 85, key: "motor_overheat_risk" }],
  door_cycle_count: [],
  cab_vibration_mm: [{ field: "avg", op: ">", limit: 6, key: "ride_quality_fault" }],
  load_weight_kg: [{ field: "max", op: ">", limit: 1000, key: "overload_warning" }],
  travel_speed_mps: [{ field: "avg", op: "<", limit: 0.5, key: "stall_suspected" }],
};

module.exports = { AlertEngine, engine, THRESHOLD_TABLE };
