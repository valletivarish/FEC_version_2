"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildState, sampleAndMaybeDispatch, startTickLoop } = require("./sensor");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("sampleAndMaybeDispatch always appends one reading to the outbox", () => {
  const state = buildState("hive_weight_kg", "apiary-a", { unit: "kg", lo: 0, hi: 80, start: 35, step: 3 }, 60_000);
  state.lastDispatch = Date.now();
  const pending = sampleAndMaybeDispatch(state, async () => {});
  assert.equal(pending, null, "dispatch interval has not elapsed, so no dispatch should be attempted");
  assert.equal(state.outbox.length, 1);
  assert.ok(state.outbox[0].value >= 0 && state.outbox[0].value <= 80);
});

test("sampleAndMaybeDispatch dispatches and clears the outbox once the interval has elapsed", async () => {
  const state = buildState("acoustic_buzz_frequency_hz", "apiary-b", { unit: "Hz", lo: 150, hi: 500, start: 250, step: 20 }, 0);
  state.lastDispatch = Date.now() - 1000;

  let seenBatch = null;
  const pending = sampleAndMaybeDispatch(state, async (batch) => {
    seenBatch = batch;
  });
  assert.ok(pending, "a dispatch should have been attempted");
  await pending;
  assert.equal(seenBatch.length, 1);
  assert.equal(state.outbox.length, 0);
});

test("sampleAndMaybeDispatch restores the batch on dispatch failure, preserving order", async () => {
  const state = buildState("internal_hive_temp_c", "apiary-a", { unit: "C", lo: 20, hi: 40, start: 34, step: 0.8 }, 0);
  state.lastDispatch = Date.now() - 1000;

  const pending = sampleAndMaybeDispatch(state, async () => {
    throw new Error("network down");
  });
  await assert.rejects(() => pending);
  assert.equal(state.outbox.length, 1, "failed batch should be retained, not dropped");
});

test("startTickLoop runs the two-phase setTimeout+queueMicrotask cycle repeatedly", async () => {
  const state = buildState("internal_humidity_pct", "apiary-a", { unit: "%", lo: 30, hi: 80, start: 55, step: 4 }, 10_000);
  const stop = startTickLoop(state, 15, async () => {}, () => {});
  await wait(90);
  stop();
  assert.ok(state.outbox.length >= 3, `expected several samples, got ${state.outbox.length}`);
});

test("startTickLoop dispatches opportunistically once the dispatch interval elapses", async () => {
  const state = buildState("entrance_traffic_count", "apiary-b", { unit: "count", lo: 0, hi: 500, start: 120, step: 30 }, 20);
  const dispatched = [];
  const stop = startTickLoop(state, 15, async (batch) => {
    dispatched.push(batch);
  }, () => {});
  await wait(100);
  stop();
  assert.ok(dispatched.length >= 1, "expected at least one opportunistic dispatch");
});

test("startTickLoop's stop function halts further ticks", async () => {
  const state = buildState("hive_weight_kg", "apiary-a", { unit: "kg", lo: 0, hi: 80, start: 35, step: 3 }, 10_000);
  const stop = startTickLoop(state, 10, async () => {}, () => {});
  await wait(30);
  stop();
  const countAfterStop = state.outbox.length;
  await wait(60);
  assert.equal(state.outbox.length, countAfterStop, "no further samples should occur after stop()");
});
