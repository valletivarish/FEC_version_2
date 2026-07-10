"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SENSOR_PROFILES, clampToRange, nextReading } = require("./profiles");

test("clampToRange bounds a value on both sides", () => {
  assert.equal(clampToRange(999, 0, 15), 15);
  assert.equal(clampToRange(-10, 0, 15), 0);
  assert.equal(clampToRange(7, 0, 15), 7);
});

test("all five water-treatment sensors have a profile", () => {
  assert.deepEqual(
    new Set(Object.keys(SENSOR_PROFILES)),
    new Set(["turbidity_ntu", "ph_level", "chlorine_ppm", "flow_rate_lps", "pressure_bar"])
  );
});

test("nextReading never leaves the profile bounds", () => {
  const profile = SENSOR_PROFILES.pressure_bar;
  let value = profile.start;
  for (let i = 0; i < 800; i++) {
    value = nextReading(value, profile);
    assert.ok(value >= profile.lo && value <= profile.hi);
  }
});

test("nextReading moves by at most the configured step", () => {
  const profile = { lo: 0, hi: 1000, start: 500, step: 8 };
  const moved = nextReading(500, profile);
  assert.ok(Math.abs(moved - 500) <= profile.step);
});

test("nextReading rounds to two decimals", () => {
  const profile = { lo: 0, hi: 1000, start: 500, step: 8 };
  const moved = nextReading(500, profile);
  assert.equal(moved, Math.round(moved * 100) / 100);
});
