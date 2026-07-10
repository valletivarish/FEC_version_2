"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const SENSOR_TYPES = ["motor_temp_c", "door_cycle_count", "cab_vibration_mm", "load_weight_kg", "travel_speed_mps"];
const SITE_IDS = ["tower-a", "tower-b"];

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

function emptyTower(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], nominal: true };
}

// Project-specific per-site grouping endpoint: one entry per tower, each
// carrying the latest window for all 5 elevator/escalator sensor types plus
// a plain `nominal` boolean -- true only when none of that tower's latest
// windows currently carry an alert. Computed on read from the same
// latest-window items already fetched for the metrics themselves; never
// stored in DynamoDB as its own attribute.
async function buildTowerSummaries(doc, tableName) {
  const towers = new Map(SITE_IDS.map((id) => [id, emptyTower(id)]));

  for (const sensorType of SENSOR_TYPES) {
    const windows = await latestWindowsFor(doc, tableName, sensorType, 30);
    const latestPerSite = new Map();
    for (const item of windows) latestPerSite.set(item.site_id, item);

    for (const [siteId, item] of latestPerSite) {
      if (!towers.has(siteId)) towers.set(siteId, emptyTower(siteId));
      const tower = towers.get(siteId);
      tower.metrics[sensorType] = {
        latest: item.latest,
        min: item.min,
        max: item.max,
        avg: item.avg,
        unit: item.unit,
        window_end: item.window_end,
        alerts: item.alerts || [],
      };
      for (const alertKey of item.alerts || []) {
        tower.alerts.push({ sensor_type: sensorType, key: alertKey });
      }
    }
  }

  for (const tower of towers.values()) {
    tower.nominal = tower.alerts.length === 0;
  }

  return Array.from(towers.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
}

async function getTowerSummary(doc, tableName, siteId) {
  const summaries = await buildTowerSummaries(doc, tableName);
  return summaries.find((tower) => tower.site_id === siteId) || null;
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

module.exports = { SENSOR_TYPES, SITE_IDS, latestWindowsFor, buildTowerSummaries, getTowerSummary, freshestAgeSeconds };
