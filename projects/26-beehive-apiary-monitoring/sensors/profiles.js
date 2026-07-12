"use strict";

// Random-walk profile per sensor type: a start value plus a per-tick swing
// bounded to [lo, hi]. Acoustic buzz frequency and entrance traffic get
// larger step sizes than hive weight or brood temperature because colony
// activity/foraging traffic genuinely swings faster tick-to-tick than the
// slow physical drift of weight or a thermoregulated brood nest.
const SENSOR_PROFILES = {
  hive_weight_kg: { unit: "kg", lo: 0, hi: 80, start: 35, step: 3.0 },
  internal_hive_temp_c: { unit: "C", lo: 20, hi: 40, start: 34, step: 0.8 },
  internal_humidity_pct: { unit: "%", lo: 30, hi: 80, start: 55, step: 4.0 },
  acoustic_buzz_frequency_hz: { unit: "Hz", lo: 150, hi: 500, start: 250, step: 20.0 },
  entrance_traffic_count: { unit: "count", lo: 0, hi: 500, start: 120, step: 30.0 },
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
