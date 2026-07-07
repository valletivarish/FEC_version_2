"use strict";

// Each sensor type gets its own inspector function rather than a shared
// generic [field, op, limit] table -- the rules differ enough in shape
// (some watch avg, one watches min) that dedicated functions read clearer.
const INSPECTORS = {
  blade_vibration_mm(summary) {
    return summary.avg > 8 ? ["structural_risk"] : [];
  },
  generator_temp_c(summary) {
    return summary.avg > 95 ? ["generator_overheat"] : [];
  },
  wind_speed_ms(summary) {
    return summary.avg > 25 ? ["high_wind_shutdown_risk"] : [];
  },
  gearbox_pressure_bar(summary) {
    return summary.min < 2.5 ? ["lubrication_fault"] : [];
  },
  power_output_kw() {
    return [];
  },
};

// Descriptive metadata kept separate from the inspector logic so /thresholds
// can publish the rules without re-deriving them from the functions above.
const THRESHOLD_TABLE = {
  blade_vibration_mm:   [{ field: "avg", op: ">", limit: 8, key: "structural_risk" }],
  generator_temp_c:     [{ field: "avg", op: ">", limit: 95, key: "generator_overheat" }],
  wind_speed_ms:        [{ field: "avg", op: ">", limit: 25, key: "high_wind_shutdown_risk" }],
  gearbox_pressure_bar: [{ field: "min", op: "<", limit: 2.5, key: "lubrication_fault" }],
  power_output_kw:      [],
};

function inspect(sensorType, summary) {
  const inspector = INSPECTORS[sensorType];
  return inspector ? inspector(summary) : [];
}

module.exports = { inspect, THRESHOLD_TABLE };
