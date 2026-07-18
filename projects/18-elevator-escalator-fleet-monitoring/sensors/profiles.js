"use strict";

// Random-walk profile per sensor type: a start value plus a per-tick swing bounded to [lo, hi].
const SENSOR_PROFILES = {
  motor_temp_c: { unit: "C", lo: 30, hi: 110, start: 55, step: 4.0 },
  door_cycle_count: { unit: "count", lo: 0, hi: 500, start: 50, step: 25.0 },
  cab_vibration_mm: { unit: "mm", lo: 0, hi: 15, start: 1, step: 0.8 },
  load_weight_kg: { unit: "kg", lo: 0, hi: 1200, start: 300, step: 100.0 },
  travel_speed_mps: { unit: "m/s", lo: 0, hi: 4, start: 1.5, step: 0.3 },
};

function holdWithinTravel(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function nextReading(current, profile) {
  const carJog = (Math.random() * 2 - 1) * profile.step;
  const pacedValue = holdWithinTravel(current + carJog, profile.lo, profile.hi);
  return Math.round(pacedValue * 100) / 100;
}

module.exports = { SENSOR_PROFILES, holdWithinTravel, nextReading };
