"use strict";

// sort_key = window_end#site_id prevents district-a and district-b readings
// for the same sensor_type in the same flush cycle from colliding on the
// DynamoDB primary key (sensor_type is the partition key, sort_key the
// range key).
function buildSortKey(windowEnd, siteId) {
  return `${windowEnd}#${siteId}`;
}

function toItem(messageBody) {
  const payload = typeof messageBody === "string" ? JSON.parse(messageBody) : messageBody;
  const siteId = payload.site_id || "district-a";
  return {
    sensor_type: payload.sensor_type,
    sort_key: buildSortKey(payload.window_end, siteId),
    window_end: payload.window_end,
    window_start: payload.window_start,
    site_id: siteId,
    unit: payload.unit || "",
    count: payload.count,
    min: payload.min,
    max: payload.max,
    avg: payload.avg,
    latest: payload.latest,
    alerts: payload.alerts || [],
  };
}

module.exports = { toItem, buildSortKey };
