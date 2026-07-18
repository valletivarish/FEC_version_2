"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const SENSOR_TYPES = ["fill_level_pct", "internal_temp_c", "gas_level_ppm", "bin_weight_kg", "lid_open_count"];
const SITE_IDS = ["district-a", "district-b"];

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

function emptyDistrict(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], compliant: true };
}

// Project-specific per-site grouping: one entry per collection district,
// each carrying the latest window for all 5 sensor types plus a plain
// `compliant` boolean -- true only when none of that district's latest
// windows currently carry an alert. Computed on read from the same
// latest-window items already fetched for the metrics themselves; never
// stored in DynamoDB as its own attribute.
async function buildDistrictSummaries(doc, tableName) {
  const districts = new Map(SITE_IDS.map((id) => [id, emptyDistrict(id)]));

  for (const sensorType of SENSOR_TYPES) {
    const windows = await latestWindowsFor(doc, tableName, sensorType, 30);
    const latestPerSite = new Map();
    for (const item of windows) latestPerSite.set(item.site_id, item);

    for (const [siteId, item] of latestPerSite) {
      if (!districts.has(siteId)) districts.set(siteId, emptyDistrict(siteId));
      const district = districts.get(siteId);
      district.metrics[sensorType] = {
        latest: item.latest,
        min: item.min,
        max: item.max,
        avg: item.avg,
        unit: item.unit,
        window_end: item.window_end,
        alerts: item.alerts || [],
      };
      for (const alertKey of item.alerts || []) {
        district.alerts.push({ sensor_type: sensorType, key: alertKey });
      }
    }
  }

  for (const district of districts.values()) {
    district.compliant = district.alerts.length === 0;
  }

  return Array.from(districts.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
}

async function getDistrictSummary(doc, tableName, siteId) {
  const summaries = await buildDistrictSummaries(doc, tableName);
  return summaries.find((district) => district.site_id === siteId) || null;
}

// The primary structural view: a flat, sorted worklist across BOTH
// districts ordered by fill_level_pct descending (the bin needing
// collection soonest is row 0), not grouped into per-site cards or a
// reading-by-site matrix.
// Sort key is fill_level_pct.latest (the freshest single reading), not
// avg -- a dispatcher deciding "which bin do I send a truck to right now"
// cares about the current fill level, not a 10-second window average.
// Districts with no fill_level_pct data yet are pushed to the end.
function buildPriorityList(districts) {
  return districts
    .map((district) => ({
      site_id: district.site_id,
      fill_level_pct: district.metrics.fill_level_pct || null,
      alerts: district.alerts,
      compliant: district.compliant,
    }))
    .sort((a, b) => {
      const aLevel = a.fill_level_pct ? a.fill_level_pct.latest : -Infinity;
      const bLevel = b.fill_level_pct ? b.fill_level_pct.latest : -Infinity;
      return bLevel - aLevel;
    });
}

async function freshestAgeSeconds(doc, tableName) {
  let freshest = null;
  for (const sensorType of SENSOR_TYPES) {
    const windows = await latestWindowsFor(doc, tableName, sensorType, 1);
    if (!windows.length) continue;
    const ageSeconds = (Date.now() - new Date(windows[windows.length - 1].window_end).getTime()) / 1000;
    if (freshest === null || ageSeconds < freshest) freshest = ageSeconds;
  }
  return freshest;
}

module.exports = {
  SENSOR_TYPES,
  SITE_IDS,
  latestWindowsFor,
  buildDistrictSummaries,
  getDistrictSummary,
  buildPriorityList,
  freshestAgeSeconds,
};
