"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");

// Sampling and dispatch are two independent recursive setTimeout loops rather
// than one setInterval driving both concerns. Each loop
// reschedules itself at the *end* of its own body, so a slow fetch during
// dispatch cannot cause overlapping dispatch calls to pile up, and the two
// rates never share a single timer tick even if they happen to be equal.
function startSampleLoop(state, sampleIntervalMs) {
  function tick() {
    state.value = nextReading(state.value, state.profile);
    state.outbox.push({ ts: new Date().toISOString(), value: state.value });
    state.sampleTimer = setTimeout(tick, sampleIntervalMs);
  }
  state.sampleTimer = setTimeout(tick, sampleIntervalMs);
}

function startDispatchLoop(state, dispatchIntervalMs, dispatch) {
  async function tick() {
    if (state.outbox.length > 0) {
      const batch = state.outbox;
      state.outbox = [];
      try {
        await dispatch(batch);
        console.log(`${state.sensorType}@${state.siteId} dispatched ${batch.length} reading(s)`);
      } catch (err) {
        state.outbox = batch.concat(state.outbox);
        console.log(`${state.sensorType}@${state.siteId} dispatch failed (${err.message}), retaining ${batch.length}`);
      }
    }
    state.dispatchTimer = setTimeout(tick, dispatchIntervalMs);
  }
  state.dispatchTimer = setTimeout(tick, dispatchIntervalMs);
}

function postBatch(gatewayUrl, sensorType, siteId, unit, batch) {
  return fetch(gatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sensor_type: sensorType, site_id: siteId, unit, readings: batch }),
  });
}

function buildState(sensorType, siteId, profile) {
  return { sensorType, siteId, profile, value: profile.start, outbox: [], sampleTimer: null, dispatchTimer: null };
}

function start() {
  const sensorType = process.env.SENSOR_TYPE;
  if (!sensorType) throw new Error("SENSOR_TYPE env var is required");
  const profile = SENSOR_PROFILES[sensorType];
  if (!profile) throw new Error(`unknown SENSOR_TYPE: ${sensorType}`);

  const siteId = process.env.SITE_ID || "station-1";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const state = buildState(sensorType, siteId, profile);
  console.log(`${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s`);

  startSampleLoop(state, sampleInterval * 1000);
  startDispatchLoop(state, dispatchInterval * 1000, (batch) => postBatch(gatewayUrl, sensorType, siteId, profile.unit, batch));
}

if (require.main === module) {
  start();
}

module.exports = { startSampleLoop, startDispatchLoop, postBatch, buildState };
