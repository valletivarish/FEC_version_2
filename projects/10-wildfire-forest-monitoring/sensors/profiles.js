"use strict";

// Random-walk profile per sensor type: start value plus a per-tick swing
// bounded to [lo, hi]. step sizes are picked per-metric so smoke/wind (which
// spike during real fire weather) drift faster than soil moisture, which
// changes slowly in reality.
const SENSOR_PROFILES = {
  temperature_c:      { unit: "C",   lo: 5,  hi: 48,  start: 22, step: 1.5 },
  humidity_pct:       { unit: "%",   lo: 5,  hi: 95,  start: 45, step: 3.0 },
  smoke_density_ppm:  { unit: "ppm", lo: 0,  hi: 400, start: 20, step: 15.0 },
  wind_speed_kmh:      { unit: "km/h", lo: 0, hi: 90, start: 15, step: 5.0 },
  soil_moisture_pct:  { unit: "%",   lo: 2,  hi: 60,  start: 25, step: 2.0 },
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
