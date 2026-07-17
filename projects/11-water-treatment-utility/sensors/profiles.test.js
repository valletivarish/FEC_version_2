"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PLANT_SENSOR_SPECS, confineToBounds, advanceReading } = require("./profiles");

test("confineToBounds bounds a value on both sides", () => {
  assert.equal(confineToBounds(999, 0, 15), 15);
  assert.equal(confineToBounds(-10, 0, 15), 0);
  assert.equal(confineToBounds(7, 0, 15), 7);
});

test("all five water-treatment sensors have a profile", () => {
  assert.deepEqual(
    new Set(Object.keys(PLANT_SENSOR_SPECS)),
    new Set(["turbidity_ntu", "ph_level", "chlorine_ppm", "flow_rate_lps", "pressure_bar"])
  );
});

test("advanceReading never leaves the profile bounds", () => {
  const profile = PLANT_SENSOR_SPECS.pressure_bar;
  let value = profile.start;
  for (let i = 0; i < 800; i++) {
    value = advanceReading(value, profile);
    assert.ok(value >= profile.lo && value <= profile.hi);
  }
});

test("advanceReading moves by at most the configured step", () => {
  const profile = { lo: 0, hi: 1000, start: 500, step: 8 };
  const moved = advanceReading(500, profile);
  assert.ok(Math.abs(moved - 500) <= profile.step);
});

test("advanceReading rounds to two decimals", () => {
  const profile = { lo: 0, hi: 1000, start: 500, step: 8 };
  const moved = advanceReading(500, profile);
  assert.equal(moved, Math.round(moved * 100) / 100);
});
