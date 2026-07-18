"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");

// Two independent recursive setTimeout loops coordinated for shutdown via a single Node AbortController checked before each unit of work and before each reschedule, rather than via clearTimeout bookkeeping.
function buildState(sensorType, siteId, profile) {
  return { sensorType, siteId, profile, value: profile.start, outbox: [] };
}

function sampleTick(state) {
  state.value = nextReading(state.value, state.profile);
  state.outbox.push({ ts: new Date().toISOString(), value: state.value });
  return state.value;
}

// Drains the whole outbox in one POST. On failure, the batch is put back in
// front of anything sampled while the request was in flight, preserving
// arrival order for the next dispatch tick.
async function dispatchTick(state, post) {
  if (state.outbox.length === 0) return 0;
  const batch = state.outbox;
  state.outbox = [];
  try {
    await post(batch);
    return batch.length;
  } catch (err) {
    state.outbox = batch.concat(state.outbox);
    throw err;
  }
}

function startSampleLoop(state, intervalMs, signal) {
  function tick() {
    if (signal.aborted) return;
    sampleTick(state);
    if (!signal.aborted) setTimeout(tick, intervalMs);
  }
  setTimeout(tick, intervalMs);
}

function startDispatchLoop(state, intervalMs, dispatch, signal, onError) {
  function tick() {
    if (signal.aborted) return;
    dispatchTick(state, dispatch)
      .catch((err) => {
        if (onError) onError(err);
      })
      .finally(() => {
        if (!signal.aborted) setTimeout(tick, intervalMs);
      });
  }
  setTimeout(tick, intervalMs);
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

  const siteId = process.env.SITE_ID || "slope-a";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const state = buildState(sensorType, siteId, profile);
  const controller = new AbortController();
  const { signal } = controller;

  console.log(`${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s (AbortController-coordinated)`);

  startSampleLoop(state, sampleInterval * 1000, signal);
  startDispatchLoop(
    state,
    dispatchInterval * 1000,
    (batch) => postBatch(gatewayUrl, sensorType, siteId, profile.unit, batch).then(() => {
      console.log(`${sensorType}@${siteId} dispatched ${batch.length} reading(s)`);
    }),
    signal,
    (err) => console.log(`${sensorType}@${siteId} dispatch failed, retaining batch: ${err.message}`)
  );

  process.on("SIGTERM", () => {
    console.log(`${sensorType}@${siteId} received SIGTERM, aborting sample/dispatch loops`);
    controller.abort();
  });

  return controller;
}

if (require.main === module) {
  start();
}

module.exports = { buildState, sampleTick, dispatchTick, startSampleLoop, startDispatchLoop, postBatch };
