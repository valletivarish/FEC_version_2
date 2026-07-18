"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");
const { startCadenceLoop } = require("./driftLoop");

// Sampling and dispatch run on independent cadence loops; the outbox array is drained wholesale each dispatch tick.
function initCarState(sensorType, siteId, profile) {
  return { sensorType, siteId, profile, value: profile.start, outbox: [] };
}

function sampleCar(car) {
  car.value = nextReading(car.value, car.profile);
  car.outbox.push({ ts: new Date().toISOString(), value: car.value });
}

async function dispatchOutbox(car, post) {
  if (car.outbox.length === 0) return;
  const batch = car.outbox;
  car.outbox = [];
  try {
    await post(batch);
    console.log(`${car.sensorType}@${car.siteId} dispatched ${batch.length} reading(s)`);
  } catch (err) {
    // Preserve arrival order: readings sampled during the failed POST go after the retained batch.
    car.outbox = batch.concat(car.outbox);
    console.log(`${car.sensorType}@${car.siteId} dispatch failed (${err.message}), retaining ${batch.length}`);
  }
}

function postToGateway(gatewayUrl, sensorType, siteId, unit, batch) {
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

  const car = initCarState(sensorType, siteId, profile);
  console.log(`${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s (drift-corrected)`);

  startCadenceLoop(sampleInterval * 1000, async () => sampleCar(car));
  startCadenceLoop(dispatchInterval * 1000, async () =>
    dispatchOutbox(car, (batch) => postToGateway(gatewayUrl, sensorType, siteId, profile.unit, batch))
  );
}

if (require.main === module) {
  start();
}

module.exports = { initCarState, sampleCar, dispatchOutbox, postToGateway };
