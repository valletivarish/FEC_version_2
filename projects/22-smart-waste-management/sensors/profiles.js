"use strict";

// Random-walk profile per sensor type: a start value plus a per-tick swing
// bounded to [lo, hi]. lid_open_count gets the smallest step (tamper/access
// events accumulate one at a time, not in bursts) while gas_level_ppm gets
// the largest (decomposition off-gassing can swing sharply tick-to-tick).
const SENSOR_PROFILES = {
  fill_level_pct: { unit: "%", lo: 0, hi: 100, start: 25, step: 8.0 },
  internal_temp_c: { unit: "C", lo: 10, hi: 70, start: 22, step: 3.0 },
  gas_level_ppm: { unit: "ppm", lo: 0, hi: 1000, start: 50, step: 40.0 },
  bin_weight_kg: { unit: "kg", lo: 0, hi: 500, start: 80, step: 25.0 },
  lid_open_count: { unit: "count", lo: 0, hi: 20, start: 1, step: 1.0 },
};

function clampToRange(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function nextReading(current, profile) {
  const swing = (Math.random() * 2 - 1) * profile.step;
  const walked = clampToRange(current + swing, profile.lo, profile.hi);
  return Math.round(walked * 100) / 100;
}

module.exports = { SENSOR_PROFILES, clampToRange, nextReading };
