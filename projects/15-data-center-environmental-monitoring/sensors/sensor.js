"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");

// Two independent setInterval calls -- one for sampling, one for dispatch --
// rather than a single shared timer (03-patient-vitals), a stateful "rig"
// object polled by one setInterval (06-offshore-wind-farm), two
// self-rescheduling setTimeout loops (10-wildfire-forest-monitoring), or a
// setInterval sampler paired with a setImmediate opportunistic drain loop
// (11-water-treatment-utility). Deliberately simple: this project's
// architectural novelty budget is spent on the API Gateway + Lambda backend
// (see backend/api/), not on sensor scheduling.
function buildState(sensorType, siteId, profile) {
  return { sensorType, siteId, profile, value: profile.start, outbox: [] };
}

function sampleTick(state) {
  state.value = nextReading(state.value, state.profile);
  state.outbox.push({ ts: new Date().toISOString(), value: state.value });
  return state.value;
}

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

  const siteId = process.env.SITE_ID || "hall-1";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const state = buildState(sensorType, siteId, profile);
  console.log(`${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s`);

  setInterval(() => sampleTick(state), sampleInterval * 1000);

  setInterval(() => {
    dispatchTick(state, (batch) => postBatch(gatewayUrl, sensorType, siteId, profile.unit, batch))
      .then((sent) => {
        if (sent > 0) console.log(`${sensorType}@${siteId} dispatched ${sent} reading(s)`);
      })
      .catch((err) => console.log(`${sensorType}@${siteId} dispatch failed, retaining batch: ${err.message}`));
  }, dispatchInterval * 1000);
}

if (require.main === module) {
  start();
}

module.exports = { buildState, sampleTick, dispatchTick, postBatch };
