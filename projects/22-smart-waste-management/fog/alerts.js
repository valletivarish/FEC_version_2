"use strict";

// Alert rules as a bare switch statement branching directly on sensor_type with no lookup structure at all -- the 7th distinct alert-rule idiom in this portfolio's fog services -- evaluated against window aggregates (avg, or max for lid_open_count), never a single raw reading.
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
