"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildState, startSampleLoop, drainTick, startDrainLoop } = require("./sensor");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("startSampleLoop reschedules itself and grows the outbox over time", async () => {
  const state = buildState("turbidity_ntu", "plant-1", { unit: "NTU", lo: 0, hi: 15, start: 1.5, step: 0.4 }, 10_000);
  startSampleLoop(state, 15);
  await wait(70);
  clearInterval(state.sampleTimer);
  assert.ok(state.outbox.length >= 3, `expected several samples, got ${state.outbox.length}`);
  for (const reading of state.outbox) {
    assert.ok(reading.value >= 0 && reading.value <= 15);
    assert.ok(typeof reading.ts === "string");
  }
});

test("drainTick does nothing when the outbox is empty", async () => {
  const state = buildState("ph_level", "plant-1", { unit: "pH", lo: 5.5, hi: 9, start: 7, step: 0.15 }, 0);
  let called = false;
  const fired = await drainTick(state, async () => {
    called = true;
  });
  assert.equal(fired, false);
  assert.equal(called, false);
});

test("drainTick does nothing when items are pending but the dispatch interval has not elapsed", async () => {
  const state = buildState("chlorine_ppm", "plant-1", { unit: "ppm", lo: 0, hi: 3, start: 0.8, step: 0.15 }, 60_000);
  state.outbox = [{ ts: "t0", value: 0.8 }];
  state.lastDispatch = Date.now();
  let called = false;
  const fired = await drainTick(state, async () => {
    called = true;
  });
  assert.equal(fired, false);
  assert.equal(called, false);
  assert.equal(state.outbox.length, 1, "batch should remain queued, not dropped");
});

test("drainTick drains and dispatches in arrival order once due", async () => {
  const state = buildState("flow_rate_lps", "plant-2", { unit: "L/s", lo: 5, hi: 120, start: 60, step: 8 }, 0);
  state.outbox = [{ ts: "t0", value: 55 }, { ts: "t1", value: 58 }];
  state.lastDispatch = Date.now() - 1000;

  let seenBatch = null;
  const fired = await drainTick(state, async (batch) => {
    seenBatch = batch;
  });

  assert.equal(fired, true);
  assert.deepEqual(seenBatch, [{ ts: "t0", value: 55 }, { ts: "t1", value: 58 }]);
  assert.equal(state.outbox.length, 0);
});

test("drainTick restores the batch to the front of the outbox on dispatch failure", async () => {
  const state = buildState("pressure_bar", "plant-1", { unit: "bar", lo: 0.5, hi: 8, start: 4, step: 0.4 }, 0);
  state.outbox = [{ ts: "t0", value: 4.1 }];
  state.lastDispatch = Date.now() - 1000;

  await assert.rejects(() =>
    drainTick(state, async () => {
      throw new Error("network down");
    })
  );
  assert.equal(state.outbox.length, 1, "failed batch should be retained, not dropped");
});

test("startDrainLoop runs opportunistically via setImmediate and fires once due", async () => {
  const state = buildState("pressure_bar", "plant-2", { unit: "bar", lo: 0.5, hi: 8, start: 4, step: 0.4 }, 20);
  state.outbox = [{ ts: "t0", value: 4.2 }];
  state.lastDispatch = Date.now();

  const seenBatches = [];
  const stop = startDrainLoop(state, async (batch) => {
    seenBatches.push(batch);
  });

  await wait(80);
  stop();
  assert.ok(seenBatches.length >= 1, "expected the opportunistic loop to fire at least once");
  assert.equal(state.outbox.length, 0);
});
