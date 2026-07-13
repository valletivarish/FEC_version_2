"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");

// Dispatch is opportunistic/event-loop-driven rather than timer-driven -- a recursive setImmediate loop only sends when the outbox is non-empty and Date.now() - lastDispatch >= dispatchIntervalMs, the 4th distinct scheduling idiom in this portfolio (vs 03's single setInterval, 06's polled "rig" object, 10's two setTimeout loops).
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
