"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { summarizeColonyHealth } = require("./colonyNarrative");

const HIVE_SENSOR_TYPES = [
  "hive_weight_kg",
  "internal_hive_temp_c",
  "internal_humidity_pct",
  "acoustic_buzz_frequency_hz",
  "entrance_traffic_count",
];
const APIARY_IDS = ["apiary-a", "apiary-b"];
const COLONY_HISTORY_SPAN = 12;

async function pullRecentWindows(doc, tableName, sensorType, limit) {
  const resp = await doc.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "sensor_type = :st",
    ExpressionAttributeValues: { ":st": sensorType },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (resp.Items || []).slice().reverse();
}

function blankApiaryCard(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], compliant: true };
}

// Every field here is derived on read from the same windows fetched for the metrics; none of it is stored in DynamoDB.
async function assembleApiaryCards(doc, tableName) {
  const apiaries = new Map(APIARY_IDS.map((id) => [id, blankApiaryCard(id)]));
  const weightHistoryBySite = new Map();
  const tempHistoryBySite = new Map();

  for (const sensorType of HIVE_SENSOR_TYPES) {
    const needsHistory = sensorType === "hive_weight_kg" || sensorType === "internal_hive_temp_c";
    const windows = await pullRecentWindows(doc, tableName, sensorType, needsHistory ? COLONY_HISTORY_SPAN * 2 : 30);

    const bySite = new Map();
    for (const item of windows) {
      if (!bySite.has(item.site_id)) bySite.set(item.site_id, []);
      bySite.get(item.site_id).push(item);
    }

    for (const [siteId, items] of bySite) {
      if (!apiaries.has(siteId)) apiaries.set(siteId, blankApiaryCard(siteId));
      const apiary = apiaries.get(siteId);
      const latest = items[items.length - 1];
      apiary.metrics[sensorType] = {
        latest: latest.latest,
        min: latest.min,
        max: latest.max,
        avg: latest.avg,
        unit: latest.unit,
        window_end: latest.window_end,
        alerts: latest.alerts || [],
      };
      for (const alertKey of latest.alerts || []) {
        apiary.alerts.push({ sensor_type: sensorType, key: alertKey });
      }
      if (sensorType === "hive_weight_kg") weightHistoryBySite.set(siteId, items.slice(-COLONY_HISTORY_SPAN));
      if (sensorType === "internal_hive_temp_c") tempHistoryBySite.set(siteId, items.slice(-COLONY_HISTORY_SPAN));
    }
  }

  for (const apiary of apiaries.values()) {
    apiary.compliant = apiary.alerts.length === 0;
    apiary.health = summarizeColonyHealth(
      apiary.site_id,
      weightHistoryBySite.get(apiary.site_id) || [],
      tempHistoryBySite.get(apiary.site_id) || [],
      apiary.alerts.length
    );
  }

  return Array.from(apiaries.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
}

async function findApiaryCard(doc, tableName, siteId) {
  const summaries = await assembleApiaryCards(doc, tableName);
  return summaries.find((apiary) => apiary.site_id === siteId) || null;
}

async function youngestReadingAge(doc, tableName) {
  let freshest = null;
  for (const sensorType of HIVE_SENSOR_TYPES) {
    const windows = await pullRecentWindows(doc, tableName, sensorType, 1);
    if (!windows.length) continue;
    const ageSeconds = (Date.now() - new Date(windows[windows.length - 1].window_end).getTime()) / 1000;
    if (freshest === null || ageSeconds < freshest) freshest = ageSeconds;
  }
  return freshest;
}

module.exports = {
  HIVE_SENSOR_TYPES,
  APIARY_IDS,
  pullRecentWindows,
  assembleApiaryCards,
  findApiaryCard,
  youngestReadingAge,
};
