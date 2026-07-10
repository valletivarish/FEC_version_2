"use strict";

// Alert rules represented as a Map<sensorType, Function>, where each
// function is a small closure built once at module load by the makeThreshold
// factory below, capturing its own field/operator/limit/key. Looking up a
// rule is a single Map.get(sensorType) call at evaluation time -- there is
// no shared [field, op, limit, key] lookup table looped over per vital
// (03-patient-vitals' fog/alerts.js), no per-sensor-type dispatch object of
// hand-written named functions (06-offshore-wind-farm's INSPECTORS), and no
// flat array of rule-descriptor objects filtered/mapped over the whole list
// (10-wildfire-forest-monitoring's RULES). Here construction and lookup are
// both genuinely different: closures are manufactured by a factory and
// stored as Map values, keyed for O(1) retrieval by sensor type.
//
// Thresholds are evaluated on the window aggregate (avg, or min for
// pressure), never a single raw reading, so one noisy sample cannot trip an
// alert on its own.
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
