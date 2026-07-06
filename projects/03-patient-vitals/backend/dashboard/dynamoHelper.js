"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

async function recentWindows(doc, tableName, sensorType, limit) {
  const resp = await doc.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "sensor_type = :st",
    ExpressionAttributeValues: { ":st": sensorType },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (resp.Items || []).reverse();
}

async function buildPatients(doc, tableName, vitals, patientIds) {
  const byPatient = new Map(patientIds.map((id) => [id, { patient_id: id, vitals: {} }]));

  for (const vital of vitals) {
    const recent = await recentWindows(doc, tableName, vital, 40);
    const latestByPatient = new Map();
    for (const item of recent) latestByPatient.set(item.site_id, item);

    for (const [patientId, item] of latestByPatient) {
      if (!byPatient.has(patientId)) byPatient.set(patientId, { patient_id: patientId, vitals: {} });
      byPatient.get(patientId).vitals[vital] = {
        latest: item.latest,
        min: item.min,
        max: item.max,
        avg: item.avg,
        count: item.count,
        unit: item.unit,
        window_end: item.window_end,
        alerts: item.alerts || [],
      };
    }
  }

  return Array.from(byPatient.values()).sort((a, b) => a.patient_id.localeCompare(b.patient_id));
}

module.exports = { recentWindows, buildPatients };
