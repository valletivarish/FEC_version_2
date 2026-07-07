"use strict";

const SENSOR_PROFILES = {
  wind_speed_ms:        { unit: "m/s", lo: 0,   hi: 35,   start: 8,   step: 2.0 },
  blade_vibration_mm:   { unit: "mm",  lo: 0,   hi: 12,   start: 1.5, step: 0.4 },
  generator_temp_c:     { unit: "C",   lo: 20,  hi: 110,  start: 55,  step: 3.0 },
  power_output_kw:      { unit: "kW",  lo: 0,   hi: 3500, start: 800, step: 150 },
  gearbox_pressure_bar: { unit: "bar", lo: 1,   hi: 8,    start: 4.5, step: 0.3 },
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
