"use strict";

// Alert rules as a single flat array of plain [field, op, limit, key]
// tuples -- arrays, not objects, not classes, not a lookup structure keyed
// by sensor type at all. Every sibling fog service in this portfolio wraps
// its rules in some container keyed by sensor_type: 03-patient-vitals'
// VITAL_LIMITS is an object mapping vital -> array of [field, op, limit,
// key] tuples (the tuple shape is similar, but grouped per vital, looped
// per vital in checkVital); 06-offshore-wind-farm uses an INSPECTORS
// dispatch object of named functions; 10-wildfire-forest-monitoring uses a
// flat array of {sensorType, key, test} rule *objects* filtered/mapped;
// 11-water-treatment-utility uses a Map<sensorType, Function> built by a
// makeThreshold() factory; 15-data-center-environmental-monitoring uses a
// plain object literal keyed by sensor_type, walked with
// Object.entries().filter(); 18-elevator-escalator-fleet-monitoring uses an
// AlertEngine class instance; 22-smart-waste-management uses a switch
// statement with no container at all. Here `field` folds the sensor type
// into the tuple itself as "sensor_type.aggregateField" (e.g.
// "internal_hive_temp_c.avg"), so RULES stays one single flat array with no
// outer grouping structure whatsoever, and evaluateAlerts() below never
// looks a sensor type up in anything -- it simply flatMaps every tuple
// through the one shared generic comparator, evaluateRule(), which parses
// the compound field to decide whether a given tuple even applies to this
// summary.
//
// Thresholds are evaluated on the window aggregate (avg), never a single
// raw reading, so one noisy sample cannot trip an alert on its own.
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
