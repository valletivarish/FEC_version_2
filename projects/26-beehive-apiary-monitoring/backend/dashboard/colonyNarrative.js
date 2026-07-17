"use strict";

const WEIGHT_RISE_THRESHOLD_KG = 0.5;
const BROOD_STABLE_SPAN_C = 1.5;

function weightTrend(weightWindows) {
  if (weightWindows.length < 2) return "steady";
  const delta = weightWindows[weightWindows.length - 1].avg - weightWindows[0].avg;
  if (delta >= WEIGHT_RISE_THRESHOLD_KG) return "rising";
  if (delta <= -WEIGHT_RISE_THRESHOLD_KG) return "falling";
  return "steady";
}

function broodThermalState(tempWindows) {
  if (tempWindows.length === 0) return "unknown";
  const anyAlert = tempWindows.some((w) => (w.alerts || []).length > 0);
  if (anyAlert) return "critical";
  const values = tempWindows.map((w) => w.avg);
  const range = Math.max(...values) - Math.min(...values);
  return range <= BROOD_STABLE_SPAN_C ? "stable" : "fluctuating";
}

const WEIGHT_TREND_PHRASES = {
  rising: "hive weight is rising, a sign of active foraging and honey accumulation",
  falling: "hive weight is falling, which can indicate resource stress or a swarm event",
  steady: "hive weight is holding steady",
};

const THERMAL_STATE_PHRASES = {
  stable: "brood-nest temperature is stable within the healthy band",
  fluctuating: "brood-nest temperature is fluctuating outside the stable band",
  critical: "brood-nest temperature has breached a safe threshold",
  unknown: "brood-nest temperature has no recent data",
};

function summarizeColonyHealth(siteId, weightWindows, tempWindows, activeAlertCount) {
  const trend = weightTrend(weightWindows);
  const stability = broodThermalState(tempWindows);
  const alertClause = activeAlertCount > 0
    ? `${activeAlertCount} active alert${activeAlertCount > 1 ? "s" : ""}.`
    : "no active alerts.";
  return {
    site_id: siteId,
    trend,
    stability,
    sentence: `${siteId}: ${WEIGHT_TREND_PHRASES[trend]}; ${THERMAL_STATE_PHRASES[stability]}. ${alertClause}`,
  };
}

module.exports = {
  WEIGHT_RISE_THRESHOLD_KG,
  BROOD_STABLE_SPAN_C,
  weightTrend,
  broodThermalState,
  summarizeColonyHealth,
};
