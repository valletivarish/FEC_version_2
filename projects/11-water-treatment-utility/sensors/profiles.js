"use strict";

// Random-walk profile per sensor type: a start value plus a per-tick swing
// bounded to [lo, hi]. Hydraulic readings (flow, pressure) are given larger
// step sizes than the chemistry readings (pH, chlorine) because a plant's
// flow/pressure genuinely swings faster tick-to-tick (pumps cycling, demand
// changes) than water chemistry, which drifts slowly by comparison.
const SENSOR_PROFILES = {
  turbidity_ntu: { unit: "NTU", lo: 0, hi: 15, start: 1.5, step: 0.4 },
  ph_level: { unit: "pH", lo: 5.5, hi: 9, start: 7.0, step: 0.15 },
  chlorine_ppm: { unit: "ppm", lo: 0, hi: 3, start: 0.8, step: 0.15 },
  flow_rate_lps: { unit: "L/s", lo: 5, hi: 120, start: 60, step: 8.0 },
  pressure_bar: { unit: "bar", lo: 0.5, hi: 8, start: 4.0, step: 0.4 },
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
