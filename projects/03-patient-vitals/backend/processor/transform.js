"use strict";

function toRecord(messageBody) {
  const data = typeof messageBody === "string" ? JSON.parse(messageBody) : messageBody;
  const patientId = data.site_id || "patient-1";
  return {
    sensor_type: data.sensor_type,
    sort_key: `${data.window_end}#${patientId}`,
    window_end: data.window_end,
    window_start: data.window_start,
    site_id: patientId,
    unit: data.unit || "",
    count: data.count,
    min: data.min,
    max: data.max,
    avg: data.avg,
    latest: data.latest,
    alerts: data.alerts || [],
  };
}

module.exports = { toRecord };
