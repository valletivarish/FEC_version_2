"use strict";

// Online per-key accumulator: folds each incoming reading into running
// count/sum/min/max/latest immediately instead of retaining the raw
// reading list, so buffer size never grows with reading volume.
function openAccumulator() {
  return { count: 0, sum: 0, min: Infinity, max: -Infinity, latest: null };
}

function fold(acc, value) {
  acc.count += 1;
  acc.sum += value;
  if (value < acc.min) acc.min = value;
  if (value > acc.max) acc.max = value;
  acc.latest = value;
  return acc;
}

function seal(acc, meta) {
  return {
    sensor_type: meta.sensorType,
    site_id: meta.siteId,
    unit: meta.unit,
    window_start: meta.windowStart,
    window_end: meta.windowEnd,
    count: acc.count,
    min: acc.min,
    max: acc.max,
    avg: Math.round((acc.sum / acc.count) * 1000) / 1000,
    latest: acc.latest,
  };
}

module.exports = { openAccumulator, fold, seal };
