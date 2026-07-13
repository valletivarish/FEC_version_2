"use strict";

// Colony-health narrative-sentence readout -- distinct from this portfolio's tile/badge/heatmap/dial/gauge dashboard idioms -- implemented as a pure, testable derived-metric function per the per-project convention (e.g. fireRisk.js).
const WEIGHT_RISE_KG = 0.5;
const TEMP_STABLE_RANGE_C = 1.5;

// Compares the oldest and newest window averages in the supplied history
// (already in chronological order) to classify hive-weight movement.
function trendDirection(weightWindows) {
  if (weightWindows.length < 2) return "steady";
  const delta = weightWindows[weightWindows.length - 1].avg - weightWindows[0].avg;
  if (delta >= WEIGHT_RISE_KG) return "rising";
  if (delta <= -WEIGHT_RISE_KG) return "falling";
  return "steady";
}

// Looks at the spread of recent brood-nest temperature averages (and
// whether any of those windows already carry a fired alert) to classify
// thermoregulation stability.
function temperatureStability(tempWindows) {
  if (tempWindows.length === 0) return "unknown";
  const anyAlert = tempWindows.some((w) => (w.alerts || []).length > 0);
  if (anyAlert) return "critical";
  const values = tempWindows.map((w) => w.avg);
  const range = Math.max(...values) - Math.min(...values);
  return range <= TEMP_STABLE_RANGE_C ? "stable" : "fluctuating";
}

const TREND_PHRASES = {
  rising: "hive weight is rising, a sign of active foraging and honey accumulation",
  falling: "hive weight is falling, which can indicate resource stress or a swarm event",
  steady: "hive weight is holding steady",
};

const STABILITY_PHRASES = {
  stable: "brood-nest temperature is stable within the healthy band",
  fluctuating: "brood-nest temperature is fluctuating outside the stable band",
  critical: "brood-nest temperature has breached a safe threshold",
  unknown: "brood-nest temperature has no recent data",
};

function describeColonyHealth(siteId, weightWindows, tempWindows, activeAlertCount) {
  const trend = trendDirection(weightWindows);
  const stability = temperatureStability(tempWindows);
  const alertClause = activeAlertCount > 0
    ? `${activeAlertCount} active alert${activeAlertCount > 1 ? "s" : ""}.`
    : "no active alerts.";
  return {
    site_id: siteId,
    trend,
    stability,
    sentence: `${siteId}: ${TREND_PHRASES[trend]}; ${STABILITY_PHRASES[stability]}. ${alertClause}`,
  };
}

module.exports = {
  WEIGHT_RISE_KG,
  TEMP_STABLE_RANGE_C,
  trendDirection,
  temperatureStability,
  describeColonyHealth,
};
