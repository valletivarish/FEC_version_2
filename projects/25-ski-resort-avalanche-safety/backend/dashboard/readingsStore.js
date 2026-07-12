"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const SENSOR_TYPES = ["snowpack_depth_cm", "snow_temp_c", "wind_speed_kmh", "seismic_vibration_mg", "lift_chair_count"];
const SITE_IDS = ["slope-a", "slope-b"];

// Ordered worst-to-first so a single Array.indexOf() comparison tells you
// which of two levels is more severe -- used by deriveRiskLevel below to
// keep the highest-severity alert's level when a slope has more than one
// active alert at once.
const RISK_LEVELS = ["LOW", "MODERATE", "HIGH", "EXTREME"];

// Maps each alert key onto the avalanche risk-scale level it represents.
// avalanche_risk_detected (the seismic precursor signal) is the only
// EXTREME-level alert; lift_wind_halt and snowpack_instability_risk both
// indicate deteriorating slope conditions at HIGH; insufficient_snow_
// coverage is a MODERATE operational concern (thin cover, not an imminent
// hazard). A slope with no active alerts is LOW.
const ALERT_RISK_LEVEL = {
  avalanche_risk_detected: "EXTREME",
  lift_wind_halt: "HIGH",
  snowpack_instability_risk: "HIGH",
  insufficient_snow_coverage: "MODERATE",
};

function deriveRiskLevel(alertKeys) {
  let worst = "LOW";
  for (const key of alertKeys || []) {
    const level = ALERT_RISK_LEVEL[key];
    if (level && RISK_LEVELS.indexOf(level) > RISK_LEVELS.indexOf(worst)) worst = level;
  }
  return worst;
}

async function latestWindowsFor(doc, tableName, sensorType, limit) {
  const resp = await doc.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "sensor_type = :st",
    ExpressionAttributeValues: { ":st": sensorType },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (resp.Items || []).slice().reverse();
}

function emptySlope(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], risk_level: "LOW" };
}

// Builds the per-slope grouping endpoint: one entry per slope, each
// carrying the latest window for all 5 sensor types plus a derived
// `risk_level` (LOW/MODERATE/HIGH/EXTREME) computed from whichever alerts
// are currently active on that slope's latest windows. Computed on read,
// directly from the same latest-window items already fetched for the
// metrics themselves; never stored in DynamoDB as its own attribute.
async function buildSlopeSummaries(doc, tableName) {
  const slopes = new Map(SITE_IDS.map((id) => [id, emptySlope(id)]));

  for (const sensorType of SENSOR_TYPES) {
    const windows = await latestWindowsFor(doc, tableName, sensorType, 30);
    const latestPerSite = new Map();
    for (const item of windows) latestPerSite.set(item.site_id, item);

    for (const [siteId, item] of latestPerSite) {
      if (!slopes.has(siteId)) slopes.set(siteId, emptySlope(siteId));
      const slope = slopes.get(siteId);
      slope.metrics[sensorType] = {
        latest: item.latest,
        min: item.min,
        max: item.max,
        avg: item.avg,
        unit: item.unit,
        window_end: item.window_end,
        alerts: item.alerts || [],
      };
      for (const alertKey of item.alerts || []) {
        slope.alerts.push({ sensor_type: sensorType, key: alertKey });
      }
    }
  }

  for (const slope of slopes.values()) {
    slope.risk_level = deriveRiskLevel(slope.alerts.map((a) => a.key));
  }

  return Array.from(slopes.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
}

async function getSlopeSummary(doc, tableName, siteId) {
  const summaries = await buildSlopeSummaries(doc, tableName);
  return summaries.find((slope) => slope.site_id === siteId) || null;
}

// Wrapped in its own try/catch (unlike latestWindowsFor/buildSlopeSummaries)
// because it feeds handleHealth's Promise.all alongside three functions that
// already degrade to false/null on failure -- a transient DynamoDB hiccup
// here should knock out just this one health field, not the whole endpoint.
async function freshestAgeSeconds(doc, tableName) {
  try {
    let freshest = null;
    for (const sensorType of SENSOR_TYPES) {
      const windows = await latestWindowsFor(doc, tableName, sensorType, 1);
      if (!windows.length) continue;
      const ageSeconds = (Date.now() - new Date(windows[windows.length - 1].window_end).getTime()) / 1000;
      if (freshest === null || ageSeconds < freshest) freshest = ageSeconds;
    }
    return freshest;
  } catch {
    return null;
  }
}

module.exports = {
  SENSOR_TYPES,
  SITE_IDS,
  RISK_LEVELS,
  deriveRiskLevel,
  latestWindowsFor,
  buildSlopeSummaries,
  getSlopeSummary,
  freshestAgeSeconds,
};
