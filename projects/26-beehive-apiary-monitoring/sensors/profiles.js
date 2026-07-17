"use strict";

// Random-walk spec per sensor type: a start value plus a per-tick swing bounded to [lo, hi].
const HIVE_SIGNAL_SPECS = {
  hive_weight_kg: { unit: "kg", lo: 0, hi: 80, start: 35, step: 3.0 },
  internal_hive_temp_c: { unit: "C", lo: 20, hi: 40, start: 34, step: 0.8 },
  internal_humidity_pct: { unit: "%", lo: 30, hi: 80, start: 55, step: 4.0 },
  acoustic_buzz_frequency_hz: { unit: "Hz", lo: 150, hi: 500, start: 250, step: 20.0 },
  entrance_traffic_count: { unit: "count", lo: 0, hi: 500, start: 120, step: 30.0 },
};

function confineToBand(reading, lo, hi) {
  if (reading < lo) return lo;
  if (reading > hi) return hi;
  return reading;
}

function stepHiveSignal(current, spec) {
  const jitter = (Math.random() * 2 - 1) * spec.step;
  const walked = confineToBand(current + jitter, spec.lo, spec.hi);
  return Math.round(walked * 100) / 100;
}

module.exports = { HIVE_SIGNAL_SPECS, confineToBand, stepHiveSignal };
