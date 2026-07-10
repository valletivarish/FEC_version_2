"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");
const { startDriftCorrectedLoop } = require("./driftLoop");

// Sampling and dispatch each get their own drift-corrected loop (see
// driftLoop.js) so SAMPLE_INTERVAL and DISPATCH_INTERVAL genuinely run
// independently -- neither rate is derived from, or waits on, the other.
// A plain array is the outbox; the dispatch loop drains it wholesale on
// every tick where it is non-empty, so nothing sampled while a POST is in
// flight is lost -- it just waits for the next dispatch tick.
function buildState(sensorType, siteId, profile) {
  return { sensorType, siteId, profile, value: profile.start, outbox: [] };
}

function sampleTick(state) {
  state.value = nextReading(state.value, state.profile);
  state.outbox.push({ ts: new Date().toISOString(), value: state.value });
}

async function dispatchTick(state, post) {
  if (state.outbox.length === 0) return;
  const batch = state.outbox;
  state.outbox = [];
  try {
    await post(batch);
    console.log(`${state.sensorType}@${state.siteId} dispatched ${batch.length} reading(s)`);
  } catch (err) {
    // Preserve arrival order: anything sampled during the failed POST goes
    // after the batch we are putting back.
    state.outbox = batch.concat(state.outbox);
    console.log(`${state.sensorType}@${state.siteId} dispatch failed (${err.message}), retaining ${batch.length}`);
  }
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

  const siteId = process.env.SITE_ID || "tower-a";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const state = buildState(sensorType, siteId, profile);
  console.log(`${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s (drift-corrected)`);

  startDriftCorrectedLoop(sampleInterval * 1000, async () => sampleTick(state));
  startDriftCorrectedLoop(dispatchInterval * 1000, async () =>
    dispatchTick(state, (batch) => postBatch(gatewayUrl, sensorType, siteId, profile.unit, batch))
  );
}

if (require.main === module) {
  start();
}

module.exports = { buildState, sampleTick, dispatchTick, postBatch };
