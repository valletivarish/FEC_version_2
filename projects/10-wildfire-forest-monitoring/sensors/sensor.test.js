"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startSampleLoop, startDispatchLoop, buildState } = require("./sensor");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("startSampleLoop reschedules itself and grows the outbox over time", async () => {
  const state = buildState("temperature_c", "station-1", { unit: "C", lo: 5, hi: 48, start: 22, step: 1.5 });
  startSampleLoop(state, 15);
  await wait(70);
  clearTimeout(state.sampleTimer);
  assert.ok(state.outbox.length >= 3, `expected several samples, got ${state.outbox.length}`);
  for (const reading of state.outbox) {
    assert.ok(reading.value >= 5 && reading.value <= 48);
    assert.ok(typeof reading.ts === "string");
  }
});

test("startDispatchLoop drains the outbox on each tick and calls dispatch", async () => {
  const state = buildState("smoke_density_ppm", "station-2", { unit: "ppm", lo: 0, hi: 400, start: 20, step: 15 });
  state.outbox = [{ ts: "t0", value: 20 }, { ts: "t1", value: 25 }];

  const seenBatches = [];
  startDispatchLoop(state, 15, async (batch) => {
    seenBatches.push(batch);
  });

  await wait(40);
  clearTimeout(state.dispatchTimer);
  assert.ok(seenBatches.length >= 1);
  assert.deepEqual(seenBatches[0], [{ ts: "t0", value: 20 }, { ts: "t1", value: 25 }]);
  assert.equal(state.outbox.length, 0);
});

test("startDispatchLoop restores the batch to the front of the outbox on failure", async () => {
  const state = buildState("wind_speed_kmh", "station-1", { unit: "km/h", lo: 0, hi: 90, start: 15, step: 5 });
  state.outbox = [{ ts: "t0", value: 15 }];

  let attempts = 0;
  startDispatchLoop(state, 15, async () => {
    attempts += 1;
    throw new Error("network down");
  });

  await wait(40);
  clearTimeout(state.dispatchTimer);
  assert.ok(attempts >= 1);
  assert.equal(state.outbox.length, 1, "failed batch should be retained, not dropped");
});
