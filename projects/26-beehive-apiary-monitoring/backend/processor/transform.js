"use strict";

// site_id in the sort key keeps two apiaries' same-sensor readings in one flush cycle from colliding on the primary key.
function composeHiveSortKey(windowEnd, apiaryId) {
  return `${windowEnd}#${apiaryId}`;
}

function toHiveReadingItem(rawWindow) {
  const window = typeof rawWindow === "string" ? JSON.parse(rawWindow) : rawWindow;
  const apiaryId = window.site_id || "apiary-a";
  return {
    sensor_type: window.sensor_type,
    sort_key: composeHiveSortKey(window.window_end, apiaryId),
    window_end: window.window_end,
    window_start: window.window_start,
    site_id: apiaryId,
    unit: window.unit || "",
    count: window.count,
    min: window.min,
    max: window.max,
    avg: window.avg,
    latest: window.latest,
    alerts: window.alerts || [],
  };
}

module.exports = { toHiveReadingItem, composeHiveSortKey };
