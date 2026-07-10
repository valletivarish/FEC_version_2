"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");
const { buildPulseState, startPulseLoop } = require("./pulse");

const DEFAULT_PULSE_MS = 250;

function buildState(sensorType, siteId, profile) {
  return { sensorType, siteId, profile, value: profile.start, outbox: [] };
}

function sampleTick(state) {
  state.value = nextReading(state.value, state.profile);
  state.outbox.push({ ts: new Date().toISOString(), value: state.value });
  return state.value;
}

// Drains the whole outbox in one POST. On failure, puts the batch back in
// front of anything sampled while the request was in flight, preserving
// arrival order for the next dispatch pulse.
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

  const siteId = process.env.SITE_ID || "district-a";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const pulseMs = parseFloat(process.env.PULSE_MS || String(DEFAULT_PULSE_MS));
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const state = buildState(sensorType, siteId, profile);
  const pulseState = buildPulseState(sampleInterval * 1000, dispatchInterval * 1000);
  console.log(
    `${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s ` +
      `(single ${pulseMs}ms pulse drives both via independent accumulators)`
  );

  startPulseLoop(
    pulseState,
    pulseMs,
    () => sampleTick(state),
    () => {
      dispatchTick(state, (batch) => postBatch(gatewayUrl, sensorType, siteId, profile.unit, batch))
        .then((sent) => {
          if (sent > 0) console.log(`${sensorType}@${siteId} dispatched ${sent} reading(s)`);
        })
        .catch((err) => console.log(`${sensorType}@${siteId} dispatch failed, retaining batch: ${err.message}`));
    }
  );
}

if (require.main === module) {
  start();
}

module.exports = { buildState, sampleTick, dispatchTick, postBatch };
