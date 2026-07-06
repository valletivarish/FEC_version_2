"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { VITAL_PROFILES, confine, stepValue } = require("./lib");

test("confine keeps value in range", () => {
  assert.equal(confine(500, 0, 100), 100);
  assert.equal(confine(-5, 0, 100), 0);
  assert.equal(confine(50, 0, 100), 50);
});

test("stepValue stays within profile bounds", () => {
  const profile = VITAL_PROFILES.heart_rate;
  let value = profile.start;
  for (let i = 0; i < 500; i++) {
    value = stepValue(value, profile);
    assert.ok(value >= profile.lo && value <= profile.hi);
  }
});

test("all five vitals have profiles", () => {
  assert.deepEqual(
    new Set(Object.keys(VITAL_PROFILES)),
    new Set(["heart_rate", "spo2", "body_temperature", "respiration_rate", "systolic_bp"])
  );
});

test("stepValue moves by at most step", () => {
  const profile = { lo: 0, hi: 100, start: 50, step: 2.0 };
  const newValue = stepValue(50, profile);
  assert.ok(Math.abs(newValue - 50) <= profile.step);
});
