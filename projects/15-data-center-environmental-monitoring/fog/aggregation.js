"use strict";

// Pure window-aggregate math over a ring buffer's ordered-array snapshot.
// Kept separate from ringBuffer.js so it can be unit tested against plain
// arrays of {ts, value} readings without touching the ring's write-index
// bookkeeping at all.
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
    // last-in-order, not max-timestamp -- ringToOrderedArray already hands
    // this function readings in original write order, so the last array
    // element is genuinely the most recently sampled value.
    latest: readings[readings.length - 1].value,
  };
}

module.exports = { summarizeWindow };
