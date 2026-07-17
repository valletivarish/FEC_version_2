"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

const PLANT_SENSOR_TYPES = ["turbidity_ntu", "ph_level", "chlorine_ppm", "flow_rate_lps", "pressure_bar"];
const PLANT_IDS = ["plant-1", "plant-2"];

async function recentWindowsFor(doc, tableName, sensorType, limit) {
  const resp = await doc.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "sensor_type = :st",
    ExpressionAttributeValues: { ":st": sensorType },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (resp.Items || []).slice().reverse();
}

function blankPlantRecord(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], compliant: true };
}

// `compliant` is derived on read (no alerts in the latest windows), never stored.
async function assemblePlantSummaries(doc, tableName) {
  const plants = new Map(PLANT_IDS.map((id) => [id, blankPlantRecord(id)]));

  for (const sensorType of PLANT_SENSOR_TYPES) {
    const windows = await recentWindowsFor(doc, tableName, sensorType, 30);
    const latestPerSite = new Map();
    for (const item of windows) latestPerSite.set(item.site_id, item);

    for (const [siteId, item] of latestPerSite) {
      if (!plants.has(siteId)) plants.set(siteId, blankPlantRecord(siteId));
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

async function findPlantSummary(doc, tableName, siteId) {
  const summaries = await assemblePlantSummaries(doc, tableName);
  return summaries.find((plant) => plant.site_id === siteId) || null;
}

async function newestReadingAgeSeconds(doc, tableName) {
  let freshest = null;
  for (const sensorType of PLANT_SENSOR_TYPES) {
    const windows = await recentWindowsFor(doc, tableName, sensorType, 1);
    if (!windows.length) continue;
    const windowAgeSeconds = (Date.now() - new Date(windows[windows.length - 1].window_end).getTime()) / 1000;
    if (freshest === null || windowAgeSeconds < freshest) freshest = windowAgeSeconds;
  }
  return freshest;
}

module.exports = { PLANT_SENSOR_TYPES, PLANT_IDS, recentWindowsFor, assemblePlantSummaries, findPlantSummary, newestReadingAgeSeconds };
