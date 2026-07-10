"use strict";

const SENSOR_PROFILES = {
  temperature_c:     { unit: "C",     lo: 15,  hi: 35,   start: 22,  step: 1.0 },
  humidity_pct:       { unit: "%",     lo: 10,  hi: 80,   start: 45,  step: 3.0 },
  airflow_cfm:         { unit: "CFM",   lo: 200, hi: 2000, start: 900, step: 80.0 },
  power_load_kw:       { unit: "kW",    lo: 5,   hi: 150,  start: 60,  step: 8.0 },
  dust_density_ugm3:   { unit: "ug/m3", lo: 0,   hi: 100,  start: 15,  step: 5.0 },
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
