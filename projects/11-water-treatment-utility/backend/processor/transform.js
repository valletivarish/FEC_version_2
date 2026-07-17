"use strict";

// window_end#site_id keeps same-sensor readings from different plants from colliding on the shared partition key.
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
