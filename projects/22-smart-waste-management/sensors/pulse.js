"use strict";

// A single shared "pulse" timer drives two independent leaky-bucket ms accumulators (decremented by interval, not reset to 0, so overshoot carries forward) for sample and dispatch rates -- the 5th distinct timer/scheduling idiom in this portfolio's Node.js projects.
function buildPulseState(sampleIntervalMs, dispatchIntervalMs) {
  return { sampleAcc: 0, dispatchAcc: 0, sampleIntervalMs, dispatchIntervalMs };
}

// Pure tick step, kept separate from the real setInterval wiring below so
// tests can drive the accumulator logic directly, tick by tick, without
// racing real timers.
function pulseTick(state, basePulseMs, onSample, onDispatch) {
  state.sampleAcc += basePulseMs;
  state.dispatchAcc += basePulseMs;

  let sampled = false;
  let dispatched = false;

  if (state.sampleAcc >= state.sampleIntervalMs) {
    state.sampleAcc -= state.sampleIntervalMs;
    onSample();
    sampled = true;
  }
  if (state.dispatchAcc >= state.dispatchIntervalMs) {
    state.dispatchAcc -= state.dispatchIntervalMs;
    onDispatch();
    dispatched = true;
  }

  return { sampled, dispatched };
}

function startPulseLoop(state, basePulseMs, onSample, onDispatch) {
  const timer = setInterval(() => pulseTick(state, basePulseMs, onSample, onDispatch), basePulseMs);
  return () => clearInterval(timer);
}

module.exports = { buildPulseState, pulseTick, startPulseLoop };
