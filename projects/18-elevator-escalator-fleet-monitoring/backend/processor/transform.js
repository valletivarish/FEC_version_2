"use strict";

// sort_key = window_end#site_id keeps tower-a and tower-b from colliding on the same partition key.
function buildSortKey(windowEnd, siteId) {
  return `${windowEnd}#${siteId}`;
}

function toItem(messageBody) {
  const payload = typeof messageBody === "string" ? JSON.parse(messageBody) : messageBody;
  const siteId = payload.site_id || "tower-a";
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
