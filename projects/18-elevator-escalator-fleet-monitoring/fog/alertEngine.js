"use strict";

// OOP rule engine: an AlertEngine instance owns a Map<sensorType,
// [{predicateFn, key}]> built up entirely through registerRule() calls made
// once at module load (below), not a generic [field, op, limit, key]
// lookup table looped over per sensor (03-patient-vitals' VITAL_LIMITS),
// not a per-sensor-type dispatch object of hand-written named functions
// (06-offshore-wind-farm's INSPECTORS), not a flat array of rule-descriptor
// objects filtered/mapped (10-wildfire-forest-monitoring's RULES), and not
// a Map<sensorType, Function> of closures built by a factory
// (11-water-treatment-utility's makeThreshold). Here a rule is registered
// as a plain predicate function closing over its own comparison, and
// evaluate() runs every predicate registered for that sensor type in
// registration order, collecting the keys of whichever ones return true.
// Thresholds are always evaluated against the window aggregate (avg or
// max), never a single raw reading, so one noisy sample cannot trip an
// alert by itself.
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
