"use strict";

// Pure window-aggregate math, run once per group at flush time over
// whatever readings the double buffer handed back -- never incrementally
// maintained during ingest. Same aggregate fields (count/min/max/avg/latest)
// as every sibling fog service in this portfolio; latest is last-in-order
// (the final element of the readings array), not the max-timestamp value.
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
