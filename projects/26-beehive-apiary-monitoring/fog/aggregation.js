"use strict";

// Pure window-aggregate math, kept separate from ringBuffer.js's storage
// mechanics so it can be unit tested against plain arrays of readings
// without touching the ring/typed-array plumbing at all. Runs once per
// group at flush time, over whatever readings snapshotAndClear() handed
// back (already zipped from the Float64Array + parallel timestamp array
// into plain {ts, value} objects, oldest first).
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
