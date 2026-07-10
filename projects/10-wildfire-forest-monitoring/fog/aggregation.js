"use strict";

// Pure window-aggregate math, kept separate from the buffering mechanism
// (buffer.js) so it can be unit tested against plain arrays of values
// without touching the EventEmitter/Map plumbing at all.
function summarizeWindow(sensorType, siteId, unit, readings, windowStart, windowEnd) {
  const values = readings.map((r) => r.value);
  const sum = values.reduce((acc, v) => acc + v, 0);
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
    latest: readings[readings.length - 1].value,
  };
}

module.exports = { summarizeWindow };
