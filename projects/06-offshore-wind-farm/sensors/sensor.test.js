"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRig } = require("./sensor");

test("sample() appends to the outbox and dueForFlush respects dispatchInterval", () => {
  const rig = buildRig({
    sensorType: "wind_speed_ms",
    siteId: "turbine-1",
    profile: { unit: "m/s", lo: 0, hi: 35, start: 8, step: 2.0 },
    dispatchInterval: 1000,
  });
  rig.sample();
  rig.sample();
  assert.equal(rig.dueForFlush(), false);
});

test("flush() drains the outbox and calls post with the batch", async () => {
  const rig = buildRig({
    sensorType: "power_output_kw",
    siteId: "turbine-2",
    profile: { unit: "kW", lo: 0, hi: 3500, start: 800, step: 150 },
    dispatchInterval: 0,
  });
  rig.sample();
  rig.sample();

  let received = null;
  await rig.flush(async (batch) => {
    received = batch;
  });

  assert.equal(received.length, 2);
  assert.equal(rig.dueForFlush(), false);
});

test("flush() restores the batch to the front of the outbox on failure", async () => {
  const rig = buildRig({
    sensorType: "generator_temp_c",
    siteId: "turbine-1",
    profile: { unit: "C", lo: 20, hi: 110, start: 55, step: 3.0 },
    dispatchInterval: 0,
  });
  rig.sample();

  await rig.flush(async () => {
    throw new Error("network down");
  });

  rig.sample();
  let secondAttempt = null;
  await rig.flush(async (batch) => {
    secondAttempt = batch;
  });
  assert.equal(secondAttempt.length, 2);
});
