"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildState, sampleTick, dispatchTick, startSampleLoop, startDispatchLoop } = require("./sensor");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("sampleTick walks the value and appends a timestamped reading to the outbox", () => {
  const state = buildState("snowpack_depth_cm", "slope-a", { lo: 0, hi: 400, start: 120, step: 15 });
  sampleTick(state);
  assert.equal(state.outbox.length, 1);
  assert.ok(state.outbox[0].value >= 0 && state.outbox[0].value <= 400);
  assert.equal(typeof state.outbox[0].ts, "string");
});

test("dispatchTick does nothing and returns 0 when the outbox is empty", async () => {
  const state = buildState("snow_temp_c", "slope-a", { lo: -25, hi: 5, start: -8, step: 2 });
  let called = false;
  const sent = await dispatchTick(state, async () => {
    called = true;
  });
  assert.equal(sent, 0);
  assert.equal(called, false);
});

test("dispatchTick drains the whole outbox in one call, in arrival order", async () => {
  const state = buildState("wind_speed_kmh", "slope-b", { lo: 0, hi: 120, start: 25, step: 8 });
  state.outbox = [{ ts: "t0", value: 25 }, { ts: "t1", value: 30 }];
  let seenBatch = null;
  const sent = await dispatchTick(state, async (batch) => {
    seenBatch = batch;
  });
  assert.equal(sent, 2);
  assert.deepEqual(seenBatch, [{ ts: "t0", value: 25 }, { ts: "t1", value: 30 }]);
  assert.equal(state.outbox.length, 0);
});

test("dispatchTick restores the batch to the front of the outbox on failure", async () => {
  const state = buildState("seismic_vibration_mg", "slope-a", { lo: 0, hi: 50, start: 3, step: 2.5 });
  state.outbox = [{ ts: "t0", value: 3 }];
  await assert.rejects(() =>
    dispatchTick(state, async () => {
      throw new Error("network down");
    })
  );
  assert.equal(state.outbox.length, 1, "failed batch should be retained, not dropped");
});

test("startSampleLoop reschedules itself via setTimeout and stops once the AbortSignal fires", async () => {
  const state = buildState("lift_chair_count", "slope-a", { lo: 0, hi: 80, start: 30, step: 6 });
  const controller = new AbortController();
  startSampleLoop(state, 15, controller.signal);
  await wait(70);
  controller.abort();
  const countAtAbort = state.outbox.length;
  assert.ok(countAtAbort >= 3, `expected several samples before abort, got ${countAtAbort}`);
  await wait(60);
  assert.equal(state.outbox.length, countAtAbort, "no further samples should be appended once aborted");
});

test("startDispatchLoop stops rescheduling once the AbortSignal fires", async () => {
  const state = buildState("wind_speed_kmh", "slope-a", { lo: 0, hi: 120, start: 25, step: 8 });
  const controller = new AbortController();
  let dispatchCount = 0;
  startDispatchLoop(
    state,
    15,
    async (batch) => {
      dispatchCount += 1;
    },
    controller.signal
  );
  state.outbox.push({ ts: "t0", value: 25 });
  await wait(50);
  controller.abort();
  const countAtAbort = dispatchCount;
  await wait(60);
  assert.equal(dispatchCount, countAtAbort, "no further dispatch ticks should run once aborted");
});

test("a signal already aborted before the loop starts never fires a single tick", async () => {
  const state = buildState("snow_temp_c", "slope-b", { lo: -25, hi: 5, start: -8, step: 2 });
  const controller = new AbortController();
  controller.abort();
  startSampleLoop(state, 10, controller.signal);
  await wait(40);
  assert.equal(state.outbox.length, 0);
});
