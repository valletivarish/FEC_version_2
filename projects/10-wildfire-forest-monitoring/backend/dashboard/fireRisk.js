"use strict";

// Fire-risk index: a derived 0-4 integer score computed from four of the
// five sensor types' current window averages. These "risk contribution"
// thresholds are deliberately lower/earlier than the hard alert thresholds
// in fog/alerts.js, so the dial climbs gradually as conditions worsen
// instead of jumping straight to 4 only when a hard alert actually fires.
// humidity_pct contributes no points -- it is shown only as a raw detail
// tile, matching the fog gateway's own alert rule set (or lack of one).
const CONTRIBUTORS = [
  { sensorType: "temperature_c", test: (avg) => avg > 30 },
  { sensorType: "smoke_density_ppm", test: (avg) => avg > 60 },
  { sensorType: "wind_speed_kmh", test: (avg) => avg > 35 },
  { sensorType: "soil_moisture_pct", test: (avg) => avg < 20 },
];

// metricsByType: { [sensorType]: { avg, ... } | undefined }. Missing
// metrics simply do not contribute a point rather than crashing the score
// -- a station with incomplete telemetry still gets a meaningful (if
// partial) reading instead of no dashboard at all.
function fireRiskIndex(metricsByType) {
  let score = 0;
  for (const contributor of CONTRIBUTORS) {
    const metric = metricsByType[contributor.sensorType];
    if (metric && contributor.test(metric.avg)) score += 1;
  }
  return score;
}

const RISK_BANDS = ["safe", "elevated", "watch", "warning", "extreme"];

function riskBand(score) {
  return RISK_BANDS[Math.max(0, Math.min(4, score))];
}

module.exports = { CONTRIBUTORS, fireRiskIndex, riskBand, RISK_BANDS };
