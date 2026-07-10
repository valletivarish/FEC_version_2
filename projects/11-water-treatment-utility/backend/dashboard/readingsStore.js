"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const SENSOR_TYPES = ["turbidity_ntu", "ph_level", "chlorine_ppm", "flow_rate_lps", "pressure_bar"];
const SITE_IDS = ["plant-1", "plant-2"];

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

function emptyPlant(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], compliant: true };
}

// Builds the per-plant grouping endpoint: one entry per treatment plant,
// each carrying the latest window for all 5 sensor types plus a plain
// `compliant` boolean -- true only when none of that plant's latest windows
// currently carry an alert. This is computed on read, directly from the
// same latest-window items already fetched for the metrics themselves; it
// is never stored in DynamoDB as its own attribute.
async function buildPlantSummaries(doc, tableName) {
  const plants = new Map(SITE_IDS.map((id) => [id, emptyPlant(id)]));

  for (const sensorType of SENSOR_TYPES) {
    const windows = await latestWindowsFor(doc, tableName, sensorType, 30);
    const latestPerSite = new Map();
    for (const item of windows) latestPerSite.set(item.site_id, item);

    for (const [siteId, item] of latestPerSite) {
      if (!plants.has(siteId)) plants.set(siteId, emptyPlant(siteId));
      const plant = plants.get(siteId);
      plant.metrics[sensorType] = {
        latest: item.latest,
        min: item.min,
        max: item.max,
        avg: item.avg,
        unit: item.unit,
        window_end: item.window_end,
        alerts: item.alerts || [],
      };
      for (const alertKey of item.alerts || []) {
        plant.alerts.push({ sensor_type: sensorType, key: alertKey });
      }
    }
  }

  for (const plant of plants.values()) {
    plant.compliant = plant.alerts.length === 0;
  }

  return Array.from(plants.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
}

async function getPlantSummary(doc, tableName, siteId) {
  const summaries = await buildPlantSummaries(doc, tableName);
  return summaries.find((plant) => plant.site_id === siteId) || null;
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

module.exports = { SENSOR_TYPES, SITE_IDS, latestWindowsFor, buildPlantSummaries, getPlantSummary, freshestAgeSeconds };
