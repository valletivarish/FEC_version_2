"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SENSOR_PROFILES, clampToRange, nextReading } = require("./profiles");

test("SENSOR_PROFILES has exactly the 5 required sensor types", () => {
  assert.deepEqual(
    Object.keys(SENSOR_PROFILES).sort(),
    ["bin_weight_kg", "fill_level_pct", "gas_level_ppm", "internal_temp_c", "lid_open_count"].sort()
  );
});

test("clampToRange clamps below lo and above hi", () => {
  assert.equal(clampToRange(-5, 0, 100), 0);
  assert.equal(clampToRange(105, 0, 100), 100);
  assert.equal(clampToRange(50, 0, 100), 50);
});

test("nextReading stays within [lo, hi] across many iterations for every profile", () => {
  for (const profile of Object.values(SENSOR_PROFILES)) {
    let value = profile.start;
    for (let i = 0; i < 500; i++) {
      value = nextReading(value, profile);
      assert.ok(value >= profile.lo && value <= profile.hi, `${value} out of [${profile.lo}, ${profile.hi}]`);
    }
  }
});

test("nextReading rounds to 2 decimal places", () => {
  const profile = { lo: 0, hi: 1000, start: 50, step: 40 };
  const value = nextReading(50, profile);
  assert.equal(Math.round(value * 100) / 100, value);
});

test("fill_level_pct profile matches the domain brief exactly", () => {
  assert.deepEqual(SENSOR_PROFILES.fill_level_pct, { unit: "%", lo: 0, hi: 100, start: 25, step: 8.0 });
});

test("lid_open_count profile matches the domain brief exactly", () => {
  assert.deepEqual(SENSOR_PROFILES.lid_open_count, { unit: "count", lo: 0, hi: 20, start: 1, step: 1.0 });
});
