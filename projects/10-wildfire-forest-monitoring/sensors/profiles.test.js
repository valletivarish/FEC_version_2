"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SENSOR_PROFILES, clampToRange, nextReading } = require("./profiles");

test("clampToRange bounds a value on both sides", () => {
  assert.equal(clampToRange(999, 0, 48), 48);
  assert.equal(clampToRange(-10, 0, 48), 0);
  assert.equal(clampToRange(17, 0, 48), 17);
});

test("all five wildfire sensors have a profile", () => {
  assert.deepEqual(
    new Set(Object.keys(SENSOR_PROFILES)),
    new Set(["temperature_c", "humidity_pct", "smoke_density_ppm", "wind_speed_kmh", "soil_moisture_pct"])
  );
});

test("nextReading never leaves the profile bounds", () => {
  const profile = SENSOR_PROFILES.smoke_density_ppm;
  let value = profile.start;
  for (let i = 0; i < 800; i++) {
    value = nextReading(value, profile);
    assert.ok(value >= profile.lo && value <= profile.hi);
  }
});

test("nextReading moves by at most the configured step", () => {
  const profile = { lo: 0, hi: 1000, start: 500, step: 150 };
  const moved = nextReading(500, profile);
  assert.ok(Math.abs(moved - 500) <= profile.step);
});

test("nextReading rounds to two decimals", () => {
  const profile = { lo: 0, hi: 1000, start: 500, step: 150 };
  const moved = nextReading(500, profile);
  assert.equal(moved, Math.round(moved * 100) / 100);
});
