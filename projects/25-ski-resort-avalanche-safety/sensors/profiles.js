"use strict";

// Random-walk profile per sensor type: a start value plus a per-tick swing
// bounded to [lo, hi]. The seismic sensor gets a small step relative to its
// range because genuine avalanche-precursor vibration is a rare spike, not a
// constant jitter, while wind and snowpack readings swing more visibly
// tick-to-tick (gusting, snowfall accumulation).
const SENSOR_PROFILES = {
  snowpack_depth_cm: { unit: "cm", lo: 0, hi: 400, start: 120, step: 15.0 },
  snow_temp_c: { unit: "C", lo: -25, hi: 5, start: -8, step: 2.0 },
  wind_speed_kmh: { unit: "km/h", lo: 0, hi: 120, start: 25, step: 8.0 },
  seismic_vibration_mg: { unit: "milli-g", lo: 0, hi: 50, start: 3, step: 2.5 },
  lift_chair_count: { unit: "count", lo: 0, hi: 80, start: 30, step: 6.0 },
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
