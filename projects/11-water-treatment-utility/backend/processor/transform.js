"use strict";

// sort_key = window_end#site_id prevents plant-1 and plant-2 readings for
// the same sensor_type in the same flush cycle from colliding on the
// DynamoDB primary key (sensor_type is the partition key, sort_key the
// range key).
function composePlantRangeKey(windowEnd, plantId) {
  return `${windowEnd}#${plantId}`;
}

function windowToReadingItem(rawWindow) {
  const windowData = typeof rawWindow === "string" ? JSON.parse(rawWindow) : rawWindow;
  const siteId = windowData.site_id || "plant-1";
  return {
    sensor_type: windowData.sensor_type,
    sort_key: composePlantRangeKey(windowData.window_end, siteId),
    window_end: windowData.window_end,
    window_start: windowData.window_start,
    site_id: siteId,
    unit: windowData.unit || "",
    count: windowData.count,
    min: windowData.min,
    max: windowData.max,
    avg: windowData.avg,
    latest: windowData.latest,
    alerts: windowData.alerts || [],
  };
}

module.exports = { windowToReadingItem, composePlantRangeKey };
