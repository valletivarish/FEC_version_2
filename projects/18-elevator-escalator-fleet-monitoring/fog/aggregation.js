"use strict";

// Pure window-aggregate math, kept free of any buffer/scheduling plumbing so
// it can be unit tested against plain reading arrays. Runs once per group,
// each time scheduler.js's flush tick fires.
function summarizeWindow(sensorType, siteId, unit, readings, windowStart, windowEnd) {
  const values = readings.map((r) => r.value);
  const sum = values.reduce((total, v) => total + v, 0);
  return {
    sensor_type: sensorType,
    site_id: siteId,
    unit,
    window_start: windowStart,
    window_end: windowEnd,
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round((sum / values.length) * 1000) / 1000,
    // last-in-order, not the maximum value -- a cab's motor could have
    // spiked mid-window and cooled by the time the window closes, so
    // "latest" must reflect the most recent sample, not the hottest one.
    latest: readings[readings.length - 1].value,
  };
}

module.exports = { summarizeWindow };
