"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");

// Two-phase macrotask-then-microtask scheduling, a genuinely different
// idiom from every Node sensor loop already built in this portfolio:
// 03-patient-vitals and 06-offshore-wind-farm each drive both sampling and
// dispatch off one flat setInterval; 10-wildfire-forest-monitoring runs two
// independent self-rescheduling setTimeout loops; 15-data-center-
// environmental-monitoring runs two independent setInterval calls, one per
// concern; 18-elevator-escalator-fleet-monitoring anchors two
// process.hrtime()-drift-corrected setTimeout loops; 22-smart-waste-
// management drives both concerns off one shared setInterval "pulse" with
// leaky-bucket accumulators; 11-water-treatment-utility pairs a setInterval
// sampler with a recursive setImmediate opportunistic drain loop. None of
// those touches queueMicrotask.
//
// Here every tick has two distinct phases: armNext() schedules the real
// SAMPLE_INTERVAL delay with a plain setTimeout (a macrotask). That
// setTimeout's callback does nothing itself except hand the actual work --
// stepping the random walk and the opportunistic dispatch check -- to
// queueMicrotask, which Node drains completely before the event loop is
// allowed to move on to the next timers phase. Only once that microtask has
// run does the callback arm the next setTimeout. So the real interval delay
// always happens in the macrotask (timer) phase, while the mutation/dispatch
// work always happens in the microtask phase that follows it -- a genuine
// two-phase split, not just "queueMicrotask wrapping everything".
function buildState(sensorType, siteId, profile, dispatchIntervalMs) {
  return {
    sensorType,
    siteId,
    profile,
    value: profile.start,
    outbox: [],
    lastDispatch: Date.now(),
    dispatchIntervalMs,
  };
}

// The microtask-phase body: one random-walk step, then an opportunistic
// dispatch check (a plain Date.now() comparison, not a countdown). Kept as
// a standalone function with no timer of its own so tests can call it
// directly instead of racing real setTimeout/queueMicrotask scheduling.
// Returns the in-flight dispatch promise when a send was attempted, or null
// when this tick only sampled.
function sampleAndMaybeDispatch(state, dispatch) {
  state.value = nextReading(state.value, state.profile);
  state.outbox.push({ ts: new Date().toISOString(), value: state.value });

  const due = state.outbox.length > 0 && Date.now() - state.lastDispatch >= state.dispatchIntervalMs;
  if (!due) return null;

  const batch = state.outbox;
  state.outbox = [];
  return dispatch(batch).then(
    () => {
      state.lastDispatch = Date.now();
    },
    (err) => {
      // Preserve arrival order: anything sampled while the failed dispatch
      // was in flight goes after the batch being put back.
      state.outbox = batch.concat(state.outbox);
      throw err;
    }
  );
}

// Wires the two-phase pattern described above. Returns a stop function.
function startTickLoop(state, sampleIntervalMs, dispatch, onError) {
  let stopped = false;
  let timer = null;

  function armNext() {
    if (stopped) return;
    timer = setTimeout(() => {
      queueMicrotask(() => {
        if (stopped) return;
        const pending = sampleAndMaybeDispatch(state, dispatch);
        if (pending) pending.catch((err) => onError && onError(err));
        armNext();
      });
    }, sampleIntervalMs);
  }

  armNext();
  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
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

  const siteId = process.env.SITE_ID || "apiary-a";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const state = buildState(sensorType, siteId, profile, dispatchInterval * 1000);
  console.log(
    `${sensorType}@${siteId} sampling every ${sampleInterval}s (setTimeout macrotask + queueMicrotask tick), ` +
      `dispatching opportunistically (>= ${dispatchInterval}s since last send)`
  );

  startTickLoop(
    state,
    sampleInterval * 1000,
    (batch) => postBatch(gatewayUrl, sensorType, siteId, profile.unit, batch).then(() => {
      console.log(`${sensorType}@${siteId} dispatched ${batch.length} reading(s)`);
    }),
    (err) => console.log(`${sensorType}@${siteId} dispatch failed, retaining batch: ${err.message}`)
  );
}

if (require.main === module) {
  start();
}

module.exports = { buildState, sampleAndMaybeDispatch, startTickLoop, postBatch };
