"use strict";

// Each tuple's field encodes "sensor_type.aggregateField", e.g. "internal_hive_temp_c.avg".
const HIVE_RULES = [
  ["internal_hive_temp_c.avg", ">", 36, "brood_overheat_risk"],
  ["internal_hive_temp_c.avg", "<", 32, "brood_chilling_risk"],
  ["hive_weight_kg.avg", "<", 20, "colony_starvation_risk"],
  ["acoustic_buzz_frequency_hz.avg", ">", 350, "swarming_precursor_detected"],
  // internal_humidity_pct and entrance_traffic_count intentionally carry no rule.
];

function applyHiveRule(tuple, summary) {
  const [field, op, limit, key] = tuple;
  const dotIndex = field.indexOf(".");
  const sensorType = field.slice(0, dotIndex);
  const aggField = field.slice(dotIndex + 1);
  if (summary.sensor_type !== sensorType) return [];
  const value = summary[aggField];
  const fired = op === ">" ? value > limit : value < limit;
  return fired ? [key] : [];
}

function detectHiveAlerts(summary) {
  return HIVE_RULES.flatMap((tuple) => applyHiveRule(tuple, summary));
}

// Descriptive metadata for the /thresholds endpoint only; detection reads HIVE_RULES directly.
const HIVE_THRESHOLD_SHEET = {
  hive_weight_kg: [{ field: "avg", op: "<", limit: 20, key: "colony_starvation_risk" }],
  internal_hive_temp_c: [
    { field: "avg", op: ">", limit: 36, key: "brood_overheat_risk" },
    { field: "avg", op: "<", limit: 32, key: "brood_chilling_risk" },
  ],
  internal_humidity_pct: [],
  acoustic_buzz_frequency_hz: [{ field: "avg", op: ">", limit: 350, key: "swarming_precursor_detected" }],
  entrance_traffic_count: [],
};

module.exports = { HIVE_RULES, applyHiveRule, detectHiveAlerts, HIVE_THRESHOLD_SHEET };
