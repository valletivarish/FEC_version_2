"use strict";

// Adult resting-vitals cutoffs, window-averaged (not single-sample) to avoid
// firing on one noisy reading. Roughly: HR 50-120bpm is normal sinus range;
// SpO2 <92% is the standard clinical hypoxia trigger; body temp >38.5C is a
// true fever by common clinical convention, <35.5C flags hypothermia risk;
// respiration 10-24 breaths/min is the adult normal band; BP 90-140 systolic
// is the normotensive range used by most bedside monitors.
const VITAL_LIMITS = {
  heart_rate:       [["avg", "<", 50, "bradycardia_risk"], ["avg", ">", 120, "tachycardia_risk"]],
  spo2:             [["avg", "<", 92, "hypoxia_risk"]],
  body_temperature: [["avg", ">", 38.5, "fever"], ["min", "<", 35.5, "hypothermia_risk"]],
  respiration_rate: [["avg", ">", 24, "respiratory_distress"], ["avg", "<", 10, "bradypnea_risk"]],
  systolic_bp:      [["avg", ">", 140, "hypertension_risk"], ["avg", "<", 90, "hypotension_risk"]],
};

function checkVital(vital, summary) {
  const rules = VITAL_LIMITS[vital] || [];
  const triggered = [];
  for (const [field, op, limit, key] of rules) {
    const value = summary[field];
    const fired = op === "<" ? value < limit : value > limit;
    if (fired) triggered.push(key);
  }
  return triggered;
}

module.exports = { VITAL_LIMITS, checkVital };
