"use strict";

// Alert rules as a Map<sensorType, Function> of factory-built closures (vs. 03-patient-vitals' looped lookup table, 06-offshore-wind-farm's dispatch object, or 10-wildfire-forest-monitoring's filtered rule array), evaluated against window aggregates rather than raw readings.
function makeThreshold(field, op, limit, key) {
  const compare = op === ">" ? (value) => value > limit : (value) => value < limit;
  return function evaluate(summary) {
    return compare(summary[field]) ? [key] : [];
  };
}

const ALERT_RULES = new Map([
  ["turbidity_ntu", makeThreshold("avg", ">", 5, "turbidity_alert")],
  ["chlorine_ppm", makeThreshold("avg", "<", 0.2, "under_chlorination")],
  ["pressure_bar", makeThreshold("min", "<", 2, "low_pressure_fault")],
  ["ph_level", makeThreshold("avg", "<", 6.5, "acidic_violation")],
  // flow_rate_lps intentionally has no rule -- absence from the Map means
  // evaluateAlerts falls through to the "no rule for this sensor" branch.
]);

function evaluateAlerts(sensorType, summary) {
  const rule = ALERT_RULES.get(sensorType);
  return rule ? rule(summary) : [];
}

// Purely descriptive projection for the /thresholds endpoint -- this table
// is metadata only and is never consulted by evaluateAlerts above, which
// always goes through the ALERT_RULES closures.
const THRESHOLD_TABLE = {
  turbidity_ntu: [{ field: "avg", op: ">", limit: 5, key: "turbidity_alert" }],
  ph_level: [{ field: "avg", op: "<", limit: 6.5, key: "acidic_violation" }],
  chlorine_ppm: [{ field: "avg", op: "<", limit: 0.2, key: "under_chlorination" }],
  flow_rate_lps: [],
  pressure_bar: [{ field: "min", op: "<", limit: 2, key: "low_pressure_fault" }],
};

module.exports = { ALERT_RULES, makeThreshold, evaluateAlerts, THRESHOLD_TABLE };
