"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SENSOR_PROFILES, holdWithinTravel, nextReading } = require("./profiles");

test("holdWithinTravel bounds a value on both sides", () => {
  assert.equal(holdWithinTravel(9999, 0, 500), 500);
  assert.equal(holdWithinTravel(-10, 0, 500), 0);
  assert.equal(holdWithinTravel(120, 0, 500), 120);
});

test("all five elevator/escalator sensors have a profile", () => {
  assert.deepEqual(
    new Set(Object.keys(SENSOR_PROFILES)),
    new Set(["motor_temp_c", "door_cycle_count", "cab_vibration_mm", "load_weight_kg", "travel_speed_mps"])
  );
});

test("nextReading never leaves the profile bounds", () => {
  const profile = SENSOR_PROFILES.motor_temp_c;
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
