"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SENSOR_PROFILES, clampToRange, nextReading } = require("./profiles");

test("clampToRange bounds a value on both sides", () => {
  assert.equal(clampToRange(999, 0, 400), 400);
  assert.equal(clampToRange(-10, 0, 400), 0);
  assert.equal(clampToRange(120, 0, 400), 120);
});

test("all five ski-resort sensors have a profile", () => {
  assert.deepEqual(
    new Set(Object.keys(SENSOR_PROFILES)),
    new Set(["snowpack_depth_cm", "snow_temp_c", "wind_speed_kmh", "seismic_vibration_mg", "lift_chair_count"])
  );
});

test("nextReading never leaves the profile bounds", () => {
  const profile = SENSOR_PROFILES.wind_speed_kmh;
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

test("seismic_vibration_mg profile stays within its documented milli-g range", () => {
  const profile = SENSOR_PROFILES.seismic_vibration_mg;
  assert.equal(profile.lo, 0);
  assert.equal(profile.hi, 50);
  assert.equal(profile.unit, "milli-g");
});
