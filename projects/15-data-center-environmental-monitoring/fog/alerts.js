"use strict";

// Alert rules as a plain object literal keyed by sensor_type, mapping to an
// array of plain rule-descriptor objects -- not a Map (11-water-treatment-
// utility), not a class, not a per-sensor-type dispatch object of named
// functions (06-offshore-wind-farm's INSPECTORS), and not a flat array
// filtered across every rule regardless of sensor type (10-wildfire-
// forest-monitoring's RULES). Evaluation walks Object.entries(RULES) with
// .filter() to find the entry for the requested sensor_type, and each
// rule's own {field, op, limit, key} is checked with a plain comparison --
// no closures are manufactured per rule (contrast 11's makeThreshold
// factory), just data sitting under a plain object key.
//
// Thresholds are evaluated on the window aggregate (avg), never a single
// raw reading, so one noisy sample cannot fire a false alert on its own.
const RULES = {
  temperature_c: [
    { field: "avg", op: ">", limit: 27, key: "overheat_risk" },
  ],
  humidity_pct: [
    { field: "avg", op: ">", limit: 60, key: "condensation_risk" },
    { field: "avg", op: "<", limit: 20, key: "static_discharge_risk" },
  ],
  airflow_cfm: [
    { field: "avg", op: "<", limit: 400, key: "insufficient_cooling" },
  ],
  power_load_kw: [
    { field: "avg", op: ">", limit: 130, key: "capacity_warning" },
  ],
  dust_density_ugm3: [
    { field: "avg", op: ">", limit: 50, key: "air_quality_risk" },
  ],
};

function fires(rule, summary) {
  const value = summary[rule.field];
  return rule.op === ">" ? value > rule.limit : value < rule.limit;
}

function evaluateAlerts(sensorType, summary) {
  const alerts = [];
  Object.entries(RULES)
    .filter(([type]) => type === sensorType)
    .forEach(([, rules]) => {
      rules.filter((rule) => fires(rule, summary)).forEach((rule) => alerts.push(rule.key));
    });
  return alerts;
}

// True if any rule for this sensor type currently fires against the given
// summary, without building the full alert-key list -- used by the
// dashboard's alert-badge rendering to short-circuit a "has any alert"
// check. Deliberately expressed with .some() rather than reusing
// evaluateAlerts().length > 0, exercising the second half of the
// "Object.entries(RULES).filter(...)/.some(...)" evaluation idiom.
function hasActiveAlert(sensorType, summary) {
  return Object.entries(RULES).some(
    ([type, rules]) => type === sensorType && rules.some((rule) => fires(rule, summary))
  );
}

module.exports = { RULES, evaluateAlerts, hasActiveAlert };
