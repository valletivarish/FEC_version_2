"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { HIVE_SIGNAL_SPECS, confineToBand, stepHiveSignal } = require("./profiles");

test("HIVE_SIGNAL_SPECS defines exactly the five beehive sensors", () => {
  assert.deepEqual(Object.keys(HIVE_SIGNAL_SPECS).sort(), [
    "acoustic_buzz_frequency_hz",
    "entrance_traffic_count",
    "hive_weight_kg",
    "internal_humidity_pct",
    "internal_hive_temp_c",
  ].sort());
});

test("confineToBand leaves in-range values untouched", () => {
  assert.equal(confineToBand(34, 20, 40), 34);
});

test("confineToBand clamps below lo and above hi", () => {
  assert.equal(confineToBand(-5, 0, 80), 0);
  assert.equal(confineToBand(999, 0, 80), 80);
});

test("stepHiveSignal always stays within [lo, hi] over many iterations", () => {
  const profile = HIVE_SIGNAL_SPECS.acoustic_buzz_frequency_hz;
  let value = profile.start;
  for (let i = 0; i < 500; i++) {
    value = stepHiveSignal(value, profile);
    assert.ok(value >= profile.lo && value <= profile.hi, `value ${value} out of range`);
  }
});

test("stepHiveSignal rounds to 2 decimal places", () => {
  const profile = { lo: 0, hi: 100, start: 50, step: 0.001 };
  const value = stepHiveSignal(50, profile);
  assert.equal(value, Math.round(value * 100) / 100);
});

test("hive_weight_kg profile matches the brief's configured range and start", () => {
  const p = HIVE_SIGNAL_SPECS.hive_weight_kg;
  assert.equal(p.unit, "kg");
  assert.equal(p.lo, 0);
  assert.equal(p.hi, 80);
  assert.equal(p.start, 35);
  assert.equal(p.step, 3.0);
});

test("internal_hive_temp_c profile matches the brief", () => {
  const p = HIVE_SIGNAL_SPECS.internal_hive_temp_c;
  assert.equal(p.unit, "C");
  assert.equal(p.lo, 20);
  assert.equal(p.hi, 40);
  assert.equal(p.start, 34);
  assert.equal(p.step, 0.8);
});

test("entrance_traffic_count profile matches the brief", () => {
  const p = HIVE_SIGNAL_SPECS.entrance_traffic_count;
  assert.equal(p.unit, "count");
  assert.equal(p.lo, 0);
  assert.equal(p.hi, 500);
  assert.equal(p.start, 120);
  assert.equal(p.step, 30.0);
});
