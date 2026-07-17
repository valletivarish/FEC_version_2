"use strict";

// Hydraulic readings (flow, pressure) use larger step sizes than chemistry because they swing faster tick-to-tick.
const PLANT_SENSOR_SPECS = {
  turbidity_ntu: { unit: "NTU", lo: 0, hi: 15, start: 1.5, step: 0.4 },
  ph_level: { unit: "pH", lo: 5.5, hi: 9, start: 7.0, step: 0.15 },
  chlorine_ppm: { unit: "ppm", lo: 0, hi: 3, start: 0.8, step: 0.15 },
  flow_rate_lps: { unit: "L/s", lo: 5, hi: 120, start: 60, step: 8.0 },
  pressure_bar: { unit: "bar", lo: 0.5, hi: 8, start: 4.0, step: 0.4 },
};

function confineToBounds(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function advanceReading(current, profile) {
  const drift = (Math.random() * 2 - 1) * profile.step;
  const boundedValue = confineToBounds(current + drift, profile.lo, profile.hi);
  return Math.round(boundedValue * 100) / 100;
}

module.exports = { PLANT_SENSOR_SPECS, confineToBounds, advanceReading };
