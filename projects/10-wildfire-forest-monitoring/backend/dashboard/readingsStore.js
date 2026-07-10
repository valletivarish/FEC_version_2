"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { fireRiskIndex } = require("./fireRisk");

const SENSOR_TYPES = ["temperature_c", "humidity_pct", "smoke_density_ppm", "wind_speed_kmh", "soil_moisture_pct"];
const SITE_IDS = ["station-1", "station-2"];

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

function emptyStation(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], fire_risk_index: 0 };
}

// Builds the per-station grouping endpoint: one entry per ranger station,
// each carrying the latest window for all 5 sensor types plus the derived
// fire_risk_index computed live from those same latest windows -- the index
// is never stored in DynamoDB, only ever computed on read.
async function buildStationSummaries(doc, tableName) {
  const stations = new Map(SITE_IDS.map((id) => [id, emptyStation(id)]));

  for (const sensorType of SENSOR_TYPES) {
    const windows = await latestWindowsFor(doc, tableName, sensorType, 30);
    const latestPerSite = new Map();
    for (const item of windows) latestPerSite.set(item.site_id, item);

    for (const [siteId, item] of latestPerSite) {
      if (!stations.has(siteId)) stations.set(siteId, emptyStation(siteId));
      const station = stations.get(siteId);
      station.metrics[sensorType] = {
        latest: item.latest,
        min: item.min,
        max: item.max,
        avg: item.avg,
        unit: item.unit,
        window_end: item.window_end,
        alerts: item.alerts || [],
      };
      for (const alertKey of item.alerts || []) {
        station.alerts.push({ sensor_type: sensorType, key: alertKey });
      }
    }
  }

  for (const station of stations.values()) {
    station.fire_risk_index = fireRiskIndex(station.metrics);
  }

  return Array.from(stations.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
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

module.exports = { SENSOR_TYPES, SITE_IDS, latestWindowsFor, buildStationSummaries, freshestAgeSeconds };
