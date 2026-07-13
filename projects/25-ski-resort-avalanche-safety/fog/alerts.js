"use strict";

// Rules are `Rule` class instances owning their own field/op/limit/check(), filtered directly via RULES.filter(r => r.check(summary)) with no separate lookup table -- distinct from sibling fog services' tuple-arrays, dispatch objects, descriptor arrays, Maps, object literals, AlertEngine wrappers, or switch statements.
class Rule {
  constructor(field, op, limit, key, sensorType) {
    this.field = field;
    this.op = op;
    this.limit = limit;
    this.key = key;
    this.sensorType = sensorType;
  }

  check(summary) {
    if (summary.sensor_type !== this.sensorType) return false;
    const value = summary[this.field];
    return this.op === ">" ? value > this.limit : value < this.limit;
  }
}

const RULES = [
  new Rule("avg", ">", 25, "avalanche_risk_detected", "seismic_vibration_mg"),
  new Rule("avg", ">", 80, "lift_wind_halt", "wind_speed_kmh"),
  new Rule("avg", ">", 2, "snowpack_instability_risk", "snow_temp_c"),
  new Rule("avg", "<", 30, "insufficient_snow_coverage", "snowpack_depth_cm"),
  // lift_chair_count intentionally has no Rule instance -- it never appears
  // in RULES, so the filter above simply never matches it.
];

function evaluateAlerts(summary) {
  return RULES.filter((r) => r.check(summary)).map((r) => r.key);
}

// Purely descriptive projection for the /thresholds endpoint -- this table
// is metadata only and is never consulted by evaluateAlerts above, which
// always goes through the Rule.check() instances, matching the same
// disclosure-vs-evaluation split every sibling fog service uses.
const THRESHOLD_TABLE = {
  snowpack_depth_cm: [{ field: "avg", op: "<", limit: 30, key: "insufficient_snow_coverage" }],
  snow_temp_c: [{ field: "avg", op: ">", limit: 2, key: "snowpack_instability_risk" }],
  wind_speed_kmh: [{ field: "avg", op: ">", limit: 80, key: "lift_wind_halt" }],
  seismic_vibration_mg: [{ field: "avg", op: ">", limit: 25, key: "avalanche_risk_detected" }],
  lift_chair_count: [],
};

module.exports = { Rule, RULES, evaluateAlerts, THRESHOLD_TABLE };
