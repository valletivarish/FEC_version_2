"use strict";

// Alert rules as a flat array of plain rule-descriptor objects, each
// independently testable against a window summary. This is a third
// representation distinct from both a generic [field, op, limit] lookup
// table (03-patient-vitals) and a per-sensor-type dispatch object of
// inspector functions (06-offshore-wind-farm): here there is no lookup by
// sensor type at all, evaluation is a single filter+map over the whole rule
// list, and each rule owns its own predicate closure instead of a shared
// comparison operator string.
//
// Thresholds are evaluated on the window aggregate (avg), not a single raw
// reading, so one noisy sample cannot fire a false alert.
const RULES = [
  { sensorType: "temperature_c", key: "extreme_heat", test: (summary) => summary.avg > 42 },
  { sensorType: "smoke_density_ppm", key: "fire_detected", test: (summary) => summary.avg > 150 },
  { sensorType: "wind_speed_kmh", key: "high_wind_warning", test: (summary) => summary.avg > 60 },
  { sensorType: "soil_moisture_pct", key: "drought_risk", test: (summary) => summary.avg < 10 },
];

function evaluateAlerts(sensorType, summary) {
  return RULES
    .filter((rule) => rule.sensorType === sensorType && rule.test(summary))
    .map((rule) => rule.key);
}

// Purely descriptive projection for the /thresholds endpoint. Deliberately
// re-derives field/op/limit display metadata rather than being read by
// evaluateAlerts -- evaluation always goes through the rule.test closures
// above, this table is metadata only.
const THRESHOLD_TABLE = {
  temperature_c: [{ field: "avg", op: ">", limit: 42, key: "extreme_heat" }],
  humidity_pct: [],
  smoke_density_ppm: [{ field: "avg", op: ">", limit: 150, key: "fire_detected" }],
  wind_speed_kmh: [{ field: "avg", op: ">", limit: 60, key: "high_wind_warning" }],
  soil_moisture_pct: [{ field: "avg", op: "<", limit: 10, key: "drought_risk" }],
};

module.exports = { RULES, evaluateAlerts, THRESHOLD_TABLE };
