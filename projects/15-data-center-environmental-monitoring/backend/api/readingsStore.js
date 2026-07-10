"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const SENSOR_TYPES = ["temperature_c", "humidity_pct", "airflow_cfm", "power_load_kw", "dust_density_ugm3"];
const SITE_IDS = ["hall-1", "hall-2"];

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

function emptyHall(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], nominal: true };
}

// Project-specific per-site grouping: one entry per server hall, each
// carrying the latest window for all 5 sensor types plus a plain `nominal`
// boolean -- true only when none of that hall's latest windows currently
// carry an alert. Computed on read from the same latest-window items
// already fetched for the metrics themselves; never stored as its own
// DynamoDB attribute.
async function buildHallSummaries(doc, tableName) {
  const halls = new Map(SITE_IDS.map((id) => [id, emptyHall(id)]));

  for (const sensorType of SENSOR_TYPES) {
    const windows = await latestWindowsFor(doc, tableName, sensorType, 30);
    const latestPerSite = new Map();
    for (const item of windows) latestPerSite.set(item.site_id, item);

    for (const [siteId, item] of latestPerSite) {
      if (!halls.has(siteId)) halls.set(siteId, emptyHall(siteId));
      const hall = halls.get(siteId);
      hall.metrics[sensorType] = {
        latest: item.latest,
        min: item.min,
        max: item.max,
        avg: item.avg,
        unit: item.unit,
        window_end: item.window_end,
        alerts: item.alerts || [],
      };
      for (const alertKey of item.alerts || []) {
        hall.alerts.push({ sensor_type: sensorType, key: alertKey });
      }
    }
  }

  for (const hall of halls.values()) {
    hall.nominal = hall.alerts.length === 0;
  }

  return Array.from(halls.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
}

async function getHallSummary(doc, tableName, siteId) {
  const summaries = await buildHallSummaries(doc, tableName);
  return summaries.find((hall) => hall.site_id === siteId) || null;
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

module.exports = { SENSOR_TYPES, SITE_IDS, latestWindowsFor, buildHallSummaries, getHallSummary, freshestAgeSeconds };
