"use strict";

// Pure window-aggregate math over a plain reading array; runs once per group per flush tick.
function rollUpRunWindow(sensorType, siteId, unit, readings, windowStart, windowEnd) {
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
    // latest is the most recent sample, not the window maximum.
    latest: readings[readings.length - 1].value,
  };
}

module.exports = { rollUpRunWindow };
