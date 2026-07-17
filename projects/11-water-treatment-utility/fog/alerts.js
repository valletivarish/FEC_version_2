"use strict";

function buildBreachRule(field, op, limit, key) {
  const crossed = op === ">" ? (value) => value > limit : (value) => value < limit;
  return function checkBreach(summary) {
    return crossed(summary[field]) ? [key] : [];
  };
}

const PLANT_BREACH_RULES = new Map([
  ["turbidity_ntu", buildBreachRule("avg", ">", 5, "turbidity_alert")],
  ["chlorine_ppm", buildBreachRule("avg", "<", 0.2, "under_chlorination")],
  ["pressure_bar", buildBreachRule("min", "<", 2, "low_pressure_fault")],
  ["ph_level", buildBreachRule("avg", "<", 6.5, "acidic_violation")],
  // flow_rate_lps intentionally has no rule
]);

function breachesForWindow(sensorType, summary) {
  const matchedRule = PLANT_BREACH_RULES.get(sensorType);
  return matchedRule ? matchedRule(summary) : [];
}

// Metadata for the /thresholds endpoint; not consulted by breachesForWindow.
const THRESHOLD_CATALOG = {
  turbidity_ntu: [{ field: "avg", op: ">", limit: 5, key: "turbidity_alert" }],
  ph_level: [{ field: "avg", op: "<", limit: 6.5, key: "acidic_violation" }],
  chlorine_ppm: [{ field: "avg", op: "<", limit: 0.2, key: "under_chlorination" }],
  flow_rate_lps: [],
  pressure_bar: [{ field: "min", op: "<", limit: 2, key: "low_pressure_fault" }],
};

module.exports = { PLANT_BREACH_RULES, buildBreachRule, breachesForWindow, THRESHOLD_CATALOG };
