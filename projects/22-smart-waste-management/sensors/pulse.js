"use strict";

// A single shared "pulse" timer drives BOTH sampling and dispatch, instead
// of each sensor container running one timer per concern. This is a
// genuinely different scheduling idiom from every Node sibling so far:
//   - 03-patient-vitals/06-offshore-wind-farm: one setInterval that ticks at
//     the SAMPLE rate itself and does both jobs (03 inline; 06 via a
//     stateful rig object) every single tick -- the timer's own rate IS the
//     sample rate, and dispatch is a wall-clock elapsed check riding along
//     on that same tick.
//   - 10-wildfire-forest-monitoring/15-data-center-environmental-monitoring:
//     two fully independent timers (setTimeout or setInterval), one per
//     concern, each running at its own configured rate directly.
//   - 11-water-treatment-utility: setInterval for sampling paired with a
//     recursive setImmediate loop for opportunistic, timer-free dispatch.
//   - 18-elevator-escalator-fleet-monitoring: two independent
//     process.hrtime()-anchored drift-corrected setTimeout loops.
//
// Here there is exactly ONE physical timer (the "pulse"), ticking at a base
// rate decoupled from both SAMPLE_INTERVAL and DISPATCH_INTERVAL (neither
// rate has to be a multiple of the other, or of the pulse). Each pulse adds
// basePulseMs to two independent millisecond accumulators; whenever an
// accumulator reaches its own interval, that concern fires and the
// accumulator is decremented (not reset to 0) by that interval, carrying
// any overshoot forward so the long-run average rate stays accurate instead
// of drifting low. This is a software-PLL/leaky-bucket style divisor, not a
// second timer and not a wall-clock Date.now() comparison.
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
