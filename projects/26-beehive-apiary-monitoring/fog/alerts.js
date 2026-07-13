"use strict";

// RULES is a single flat array of [field, op, limit, key] tuples with no per-sensor-type container -- field encodes "sensor_type.aggregateField" directly (e.g. "internal_hive_temp_c.avg"), the 8th distinct alert-rule idiom in this portfolio's fog services.
const RULES = [
  ["internal_hive_temp_c.avg", ">", 36, "brood_overheat_risk"],
  ["internal_hive_temp_c.avg", "<", 32, "brood_chilling_risk"],
  ["hive_weight_kg.avg", "<", 20, "colony_starvation_risk"],
  ["acoustic_buzz_frequency_hz.avg", ">", 350, "swarming_precursor_detected"],
  // internal_humidity_pct and entrance_traffic_count intentionally have no
  // rule -- neither appears anywhere in RULES, so evaluateAlerts() never
  // fires for them, and the /thresholds endpoint below lists them with an
  // empty array.
];

// The single shared generic comparator every rule is run through. Splits
// the compound field on "." to recover which sensor type the tuple applies
// to and which aggregate field on the summary to read, then applies the
// tuple's own operator/limit. Returns the tuple's alert key wrapped in an
// array (so RULES.flatMap can flatten it directly) when the tuple both
// applies to this summary's sensor type and its comparison fires, or an
// empty array otherwise.
function evaluateRule(tuple, summary) {
  const [field, op, limit, key] = tuple;
  const dotIndex = field.indexOf(".");
  const sensorType = field.slice(0, dotIndex);
  const aggField = field.slice(dotIndex + 1);
  if (summary.sensor_type !== sensorType) return [];
  const value = summary[aggField];
  const fired = op === ">" ? value > limit : value < limit;
  return fired ? [key] : [];
}

function evaluateAlerts(summary) {
  return RULES.flatMap((tuple) => evaluateRule(tuple, summary));
}

// Purely descriptive projection for the /thresholds endpoint -- this table
// is metadata only and is never consulted by evaluateAlerts()/evaluateRule()
// above, which always work directly off the RULES tuples.
const THRESHOLD_TABLE = {
  hive_weight_kg: [{ field: "avg", op: "<", limit: 20, key: "colony_starvation_risk" }],
  internal_hive_temp_c: [
    { field: "avg", op: ">", limit: 36, key: "brood_overheat_risk" },
    { field: "avg", op: "<", limit: 32, key: "brood_chilling_risk" },
  ],
  internal_humidity_pct: [],
  acoustic_buzz_frequency_hz: [{ field: "avg", op: ">", limit: 350, key: "swarming_precursor_detected" }],
  entrance_traffic_count: [],
};

module.exports = { RULES, evaluateRule, evaluateAlerts, THRESHOLD_TABLE };
