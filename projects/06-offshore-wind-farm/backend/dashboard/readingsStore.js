"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const SENSOR_TYPES = ["wind_speed_ms", "blade_vibration_mm", "generator_temp_c", "power_output_kw", "gearbox_pressure_bar"];
const SITE_IDS = ["turbine-1", "turbine-2"];

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

function emptyTile(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [] };
}

// Builds the farm-layout grid: one tile per turbine site, each carrying the
// latest reading for every sensor type plus a merged alert list.
async function buildFarmGrid(doc, tableName) {
  const tiles = new Map(SITE_IDS.map((id) => [id, emptyTile(id)]));

  for (const sensorType of SENSOR_TYPES) {
    const windows = await latestWindowsFor(doc, tableName, sensorType, 30);
    const latestPerSite = new Map();
    for (const item of windows) latestPerSite.set(item.site_id, item);

    for (const [siteId, item] of latestPerSite) {
      if (!tiles.has(siteId)) tiles.set(siteId, emptyTile(siteId));
      const tile = tiles.get(siteId);
      tile.metrics[sensorType] = {
        latest: item.latest,
        min: item.min,
        max: item.max,
        avg: item.avg,
        unit: item.unit,
        window_end: item.window_end,
        alerts: item.alerts || [],
      };
      for (const alertKey of item.alerts || []) {
        tile.alerts.push({ sensor_type: sensorType, key: alertKey });
      }
    }
  }

  return Array.from(tiles.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
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

module.exports = { SENSOR_TYPES, SITE_IDS, latestWindowsFor, buildFarmGrid, freshestAgeSeconds };
