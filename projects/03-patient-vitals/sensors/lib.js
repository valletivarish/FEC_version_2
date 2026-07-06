"use strict";

const VITAL_PROFILES = {
  heart_rate:       { unit: "bpm",  lo: 40, hi: 160, start: 75,  step: 4.0 },
  spo2:             { unit: "%",    lo: 85, hi: 100, start: 97,  step: 1.0 },
  body_temperature: { unit: "C",    lo: 34, hi: 41,  start: 37,  step: 0.3 },
  respiration_rate: { unit: "brpm", lo: 6,  hi: 32,  start: 16,  step: 1.5 },
  systolic_bp:      { unit: "mmHg", lo: 80, hi: 180, start: 118, step: 5.0 },
};

function confine(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function stepValue(current, profile) {
  const delta = (Math.random() * 2 - 1) * profile.step;
  const moved = confine(current + delta, profile.lo, profile.hi);
  return Math.round(moved * 100) / 100;
}

module.exports = { VITAL_PROFILES, confine, stepValue };
