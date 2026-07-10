"use strict";

// Alert rules as plain control flow -- a switch statement keyed on
// sensor_type -- rather than any data structure at all. Every sibling fog
// service in this portfolio represents its rules as *some* lookup
// structure: 03-patient-vitals uses a generic [field, op, limit, key]
// tuple-array object (VITAL_LIMITS); 06-offshore-wind-farm uses a
// per-sensor-type dispatch object of named inspector functions
// (INSPECTORS); 10-wildfire-forest-monitoring uses a flat array of
// {sensorType, key, test} rule-descriptor objects walked with
// RULES.filter().map(); 11-water-treatment-utility uses a
// Map<sensorType, Function> of closures built by a makeThreshold() factory;
// 15-data-center-environmental-monitoring uses a plain object literal keyed
// by sensor_type, walked with Object.entries(RULES).filter(); and
// 18-elevator-escalator-fleet-monitoring uses an AlertEngine class instance
// wrapping a Map<sensorType, [{predicateFn, key}]> built via
// registerRule(). None of those is a switch statement: there is no
// container to look a sensor type up in here at all, evaluateAlerts()
// simply branches on sensorType directly and returns the fired key(s)
// inline in each case. Thresholds are always evaluated on the window
// aggregate (avg, or max for lid_open_count), never a single raw reading,
// so one noisy sample cannot trip an alert by itself.
function evaluateAlerts(sensorType, summary) {
  switch (sensorType) {
    case "fill_level_pct":
      return summary.avg > 85 ? ["collection_needed"] : [];
    case "internal_temp_c":
      return summary.avg > 55 ? ["fire_risk_warning"] : [];
    case "gas_level_ppm":
      return summary.avg > 400 ? ["odor_gas_exceedance"] : [];
    case "lid_open_count":
      return summary.max > 8 ? ["tamper_suspected"] : [];
    // bin_weight_kg intentionally has no case -- falls through to the
    // default branch, an informational-only reading with no alert rule.
    default:
      return [];
  }
}

// Purely descriptive projection for the /thresholds endpoint. Deliberately
// re-states field/op/limit/key as plain metadata rather than being read by
// evaluateAlerts() above -- real evaluation always goes through the switch,
// this table exists only so the endpoint can disclose the rules, matching
// the disclosure-vs-evaluation split every sibling fog service uses.
const THRESHOLD_TABLE = {
  fill_level_pct: [{ field: "avg", op: ">", limit: 85, key: "collection_needed" }],
  internal_temp_c: [{ field: "avg", op: ">", limit: 55, key: "fire_risk_warning" }],
  gas_level_ppm: [{ field: "avg", op: ">", limit: 400, key: "odor_gas_exceedance" }],
  bin_weight_kg: [],
  lid_open_count: [{ field: "max", op: ">", limit: 8, key: "tamper_suspected" }],
};

module.exports = { evaluateAlerts, THRESHOLD_TABLE };
