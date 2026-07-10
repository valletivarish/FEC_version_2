"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");

// Sampling is a single plain setInterval -- simple, fixed-rate, same idiom
// 03-patient-vitals uses for its one-and-only timer. Dispatch, however, is
// deliberately NOT driven by any timer at all. drainTick() is invoked over
// and over by a recursive setImmediate loop (startDrainLoop below) and only
// performs a real send when BOTH the outbox has items AND dispatchIntervalMs
// has elapsed since the last successful send (a plain Date.now() timestamp
// comparison, not a countdown). When neither condition holds the loop just
// reschedules itself for the next turn of the event loop and does nothing.
// This makes dispatch opportunistic/event-loop-driven rather than
// timer-driven -- a fourth scheduling idiom distinct from 03's single
// setInterval doing both jobs inline, 06's stateful "rig" object polled by
// one setInterval, and 10's two independent self-rescheduling setTimeout
// loops (one per concern, but still each a real timer).
function buildState(sensorType, siteId, profile, dispatchIntervalMs) {
  return {
    sensorType,
    siteId,
    profile,
    value: profile.start,
    outbox: [],
    lastDispatch: Date.now(),
    dispatchIntervalMs,
    sampleTimer: null,
  };
}

function startSampleLoop(state, sampleIntervalMs) {
  state.sampleTimer = setInterval(() => {
    state.value = nextReading(state.value, state.profile);
    state.outbox.push({ ts: new Date().toISOString(), value: state.value });
  }, sampleIntervalMs);
  return state.sampleTimer;
}

// One check-and-maybe-drain step. Kept separate from the recursive loop
// below so tests can call it directly against a controlled state object
// instead of racing real timers. Uses Array.prototype.shift() to drain the
// outbox in strict arrival order.
async function drainTick(state, dispatch) {
  const due = state.outbox.length > 0 && Date.now() - state.lastDispatch >= state.dispatchIntervalMs;
  if (!due) return false;

  const batch = [];
  while (state.outbox.length > 0) batch.push(state.outbox.shift());

  try {
    await dispatch(batch);
    state.lastDispatch = Date.now();
    return true;
  } catch (err) {
    // Put the undelivered batch back in front of anything sampled while the
    // dispatch attempt was in flight, preserving arrival order.
    state.outbox = batch.concat(state.outbox);
    throw err;
  }
}

// The perpetual opportunistic loop: reschedule via setImmediate forever,
// only ever doing real work when drainTick() decides it is due. Returns a
// stop function so callers (and tests) can halt it cleanly.
function startDrainLoop(state, dispatch, onError) {
  let stopped = false;

  function loop() {
    if (stopped) return;
    drainTick(state, dispatch)
      .catch((err) => {
        if (onError) onError(err);
      })
      .finally(() => {
        if (!stopped) setImmediate(loop);
      });
  }

  setImmediate(loop);
  return () => {
    stopped = true;
  };
}

function postBatch(gatewayUrl, sensorType, siteId, unit, batch) {
  return fetch(gatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sensor_type: sensorType, site_id: siteId, unit, readings: batch }),
  });
}

function start() {
  const sensorType = process.env.SENSOR_TYPE;
  if (!sensorType) throw new Error("SENSOR_TYPE env var is required");
  const profile = SENSOR_PROFILES[sensorType];
  if (!profile) throw new Error(`unknown SENSOR_TYPE: ${sensorType}`);

  const siteId = process.env.SITE_ID || "plant-1";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const state = buildState(sensorType, siteId, profile, dispatchInterval * 1000);
  console.log(`${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching opportunistically (>= ${dispatchInterval}s since last send)`);

  startSampleLoop(state, sampleInterval * 1000);
  startDrainLoop(
    state,
    (batch) => postBatch(gatewayUrl, sensorType, siteId, profile.unit, batch).then(() => {
      console.log(`${sensorType}@${siteId} dispatched ${batch.length} reading(s)`);
    }),
    (err) => console.log(`${sensorType}@${siteId} dispatch failed, retaining batch: ${err.message}`)
  );
}

if (require.main === module) {
  start();
}

module.exports = { buildState, startSampleLoop, drainTick, startDrainLoop, postBatch };
