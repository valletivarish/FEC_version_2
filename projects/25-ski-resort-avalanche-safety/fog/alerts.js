"use strict";

// Alert rules as per-rule Rule class instances stored in a plain array, each
// instance owning its own field/operator/limit/key/sensor_type and knowing
// how to check itself against a window summary. evaluateAlerts() is a single
// RULES.filter(r => r.check(summary)) call -- there is no lookup step before
// the filter runs and no shared comparison table looked up by sensor type.
// This is distinct from every sibling fog service in this portfolio:
// 03-patient-vitals uses a generic [field, op, limit, key] tuple-array
// object (VITAL_LIMITS) looped per vital; 06-offshore-wind-farm uses a
// per-sensor-type dispatch object of hand-written named functions
// (INSPECTORS); 10-wildfire-forest-monitoring uses a flat array of plain
// {sensorType, key, test} rule-descriptor objects (no class, just data);
// 11-water-treatment-utility uses a Map<sensorType, Function> of closures
// built by a makeThreshold() factory; 15-data-center-environmental-
// monitoring uses a plain object literal keyed by sensor_type walked with
// Object.entries(RULES).filter(); 18-elevator-escalator-fleet-monitoring
// wraps a Map inside an AlertEngine class (registerRule()/evaluate()), which
// is a class OWNING a lookup structure rather than the rules themselves
// being class instances; 22-smart-waste-management uses a bare switch
// statement with no container at all. Here the rules ARE the objects in the
// array -- each one is a real `new Rule(...)` instance with its own check()
// method, and evaluation never consults anything but that one array.
//
// Thresholds are evaluated on the window aggregate (avg), never a single
// raw reading, so one noisy sample cannot trip an alert on its own.
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
