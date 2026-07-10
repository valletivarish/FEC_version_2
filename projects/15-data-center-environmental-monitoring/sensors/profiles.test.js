"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SENSOR_PROFILES, clampToRange, nextReading } = require("./profiles");

test("exactly the 5 data-center sensor types are defined with unit/lo/hi/start/step", () => {
  const types = Object.keys(SENSOR_PROFILES);
  assert.deepEqual(
    types.sort(),
    ["airflow_cfm", "dust_density_ugm3", "humidity_pct", "power_load_kw", "temperature_c"].sort()
  );
  for (const profile of Object.values(SENSOR_PROFILES)) {
    assert.equal(typeof profile.unit, "string");
    assert.equal(typeof profile.lo, "number");
    assert.equal(typeof profile.hi, "number");
    assert.equal(typeof profile.start, "number");
    assert.equal(typeof profile.step, "number");
    assert.ok(profile.lo < profile.hi);
    assert.ok(profile.start >= profile.lo && profile.start <= profile.hi);
  }
});

test("profile values match the exact brief-specified bounds", () => {
  assert.deepEqual(SENSOR_PROFILES.temperature_c, { unit: "C", lo: 15, hi: 35, start: 22, step: 1.0 });
  assert.deepEqual(SENSOR_PROFILES.humidity_pct, { unit: "%", lo: 10, hi: 80, start: 45, step: 3.0 });
  assert.deepEqual(SENSOR_PROFILES.airflow_cfm, { unit: "CFM", lo: 200, hi: 2000, start: 900, step: 80.0 });
  assert.deepEqual(SENSOR_PROFILES.power_load_kw, { unit: "kW", lo: 5, hi: 150, start: 60, step: 8.0 });
  assert.deepEqual(SENSOR_PROFILES.dust_density_ugm3, { unit: "ug/m3", lo: 0, hi: 100, start: 15, step: 5.0 });
});

test("clampToRange confines a value to [lo, hi] inclusive", () => {
  assert.equal(clampToRange(50, 0, 100), 50);
  assert.equal(clampToRange(-5, 0, 100), 0);
  assert.equal(clampToRange(150, 0, 100), 100);
});

test("nextReading always stays inside [lo, hi] and is rounded to 2 decimals", () => {
  const profile = SENSOR_PROFILES.temperature_c;
  let value = profile.start;
  for (let i = 0; i < 500; i++) {
    value = nextReading(value, profile);
    assert.ok(value >= profile.lo && value <= profile.hi, `value ${value} out of range`);
    assert.equal(Math.round(value * 100) / 100, value, "value should already be rounded to 2 decimals");
  }
});

test("nextReading drifts (a long random walk visits more than one distinct value)", () => {
  const profile = SENSOR_PROFILES.power_load_kw;
  let value = profile.start;
  const seen = new Set([value]);
  for (let i = 0; i < 200; i++) {
    value = nextReading(value, profile);
    seen.add(value);
  }
  assert.ok(seen.size > 1, "random walk should not be stuck on a single value");
});
