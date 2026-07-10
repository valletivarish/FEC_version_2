"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPulseState, pulseTick } = require("./pulse");

test("pulseTick does not fire onSample before the accumulator reaches sampleIntervalMs", () => {
  const state = buildPulseState(1000, 999999);
  let samples = 0;
  pulseTick(state, 400, () => samples++, () => {}); // acc=400
  pulseTick(state, 400, () => samples++, () => {}); // acc=800
  assert.equal(samples, 0);
});

test("pulseTick fires onSample exactly on the pulse where the accumulator crosses the interval", () => {
  const state = buildPulseState(1000, 999999);
  let samples = 0;
  pulseTick(state, 400, () => samples++, () => {}); // acc=400
  pulseTick(state, 400, () => samples++, () => {}); // acc=800
  pulseTick(state, 400, () => samples++, () => {}); // acc=1200 -> fires, carries 200
  assert.equal(samples, 1);
  assert.equal(state.sampleAcc, 200, "overshoot beyond the interval is carried forward, not discarded");
});

test("sample and dispatch accumulators are independent -- neither interval needs to divide the other", () => {
  const state = buildPulseState(900, 2000);
  let samples = 0;
  let dispatches = 0;
  for (let i = 0; i < 20; i++) {
    pulseTick(state, 300, () => samples++, () => dispatches++);
  }
  // 20 pulses * 300ms = 6000ms elapsed: floor(6000/900) = 6 samples, floor(6000/2000) = 3 dispatches.
  assert.equal(samples, 6);
  assert.equal(dispatches, 3);
});

test("carry-forward keeps the long-run average rate accurate instead of drifting low", () => {
  const state = buildPulseState(1000, 999999);
  let samples = 0;
  for (let i = 0; i < 10; i++) pulseTick(state, 700, () => samples++, () => {});
  // 10 pulses * 700ms = 7000ms elapsed -> exactly floor(7000/1000) = 7 fires. A
  // reset-to-zero-on-fire scheme would under-fire here because it throws away
  // the overshoot every time the accumulator crosses the interval.
  assert.equal(samples, 7);
});

test("a single oversized pulse only fires once per tick and carries the remainder (no catch-up burst)", () => {
  const state = buildPulseState(500, 999999);
  let samples = 0;
  pulseTick(state, 1800, () => samples++, () => {});
  // 1800ms is 3.6x the 500ms interval, but this design checks "has the
  // accumulator crossed the interval" once per physical tick, not "how many
  // whole intervals fit in the accumulator" -- so exactly one fire, with
  // 1300ms carried forward for the next tick.
  assert.equal(samples, 1);
  assert.equal(state.sampleAcc, 1300);
});

test("onSample and onDispatch can both fire on the same tick when both accumulators cross together", () => {
  const state = buildPulseState(1000, 1000);
  let samples = 0;
  let dispatches = 0;
  pulseTick(state, 1000, () => samples++, () => dispatches++);
  assert.equal(samples, 1);
  assert.equal(dispatches, 1);
});

test("buildPulseState starts both accumulators at zero", () => {
  const state = buildPulseState(1000, 5000);
  assert.equal(state.sampleAcc, 0);
  assert.equal(state.dispatchAcc, 0);
});
