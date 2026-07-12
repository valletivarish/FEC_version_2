"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { describeColonyHealth } = require("./colonyNarrative");

const SENSOR_TYPES = [
  "hive_weight_kg",
  "internal_hive_temp_c",
  "internal_humidity_pct",
  "acoustic_buzz_frequency_hz",
  "entrance_traffic_count",
];
const SITE_IDS = ["apiary-a", "apiary-b"];
const NARRATIVE_HISTORY_LIMIT = 12;

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

function emptyApiary(siteId) {
  return { site_id: siteId, metrics: {}, alerts: [], compliant: true };
}

// Builds the per-apiary grouping endpoint: one entry per apiary, each
// carrying the latest window for all 5 sensor types, a plain `compliant`
// boolean (true only when none of that apiary's latest windows currently
// carry an alert), and a `health` narrative sentence combining recent
// hive-weight trend with recent brood-temperature stability (see
// colonyNarrative.js). Everything here is computed on read from windows
// already fetched for the metrics themselves; none of it is stored in
// DynamoDB as its own attribute.
async function buildApiarySummaries(doc, tableName) {
  const apiaries = new Map(SITE_IDS.map((id) => [id, emptyApiary(id)]));
  const weightHistoryBySite = new Map();
  const tempHistoryBySite = new Map();

  for (const sensorType of SENSOR_TYPES) {
    const needsHistory = sensorType === "hive_weight_kg" || sensorType === "internal_hive_temp_c";
    const windows = await latestWindowsFor(doc, tableName, sensorType, needsHistory ? NARRATIVE_HISTORY_LIMIT * 2 : 30);

    const bySite = new Map();
    for (const item of windows) {
      if (!bySite.has(item.site_id)) bySite.set(item.site_id, []);
      bySite.get(item.site_id).push(item);
    }

    for (const [siteId, items] of bySite) {
      if (!apiaries.has(siteId)) apiaries.set(siteId, emptyApiary(siteId));
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
      if (sensorType === "hive_weight_kg") weightHistoryBySite.set(siteId, items.slice(-NARRATIVE_HISTORY_LIMIT));
      if (sensorType === "internal_hive_temp_c") tempHistoryBySite.set(siteId, items.slice(-NARRATIVE_HISTORY_LIMIT));
    }
  }

  for (const apiary of apiaries.values()) {
    apiary.compliant = apiary.alerts.length === 0;
    apiary.health = describeColonyHealth(
      apiary.site_id,
      weightHistoryBySite.get(apiary.site_id) || [],
      tempHistoryBySite.get(apiary.site_id) || [],
      apiary.alerts.length
    );
  }

  return Array.from(apiaries.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
}

async function getApiarySummary(doc, tableName, siteId) {
  const summaries = await buildApiarySummaries(doc, tableName);
  return summaries.find((apiary) => apiary.site_id === siteId) || null;
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
  buildApiarySummaries,
  getApiarySummary,
  freshestAgeSeconds,
};
