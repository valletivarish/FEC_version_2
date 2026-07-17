"use strict";

const { PLANT_SENSOR_SPECS, advanceReading } = require("./profiles");

function createSamplerState(sensorType, siteId, profile, dispatchIntervalMs) {
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

function beginSampling(sampler, sampleIntervalMs) {
  sampler.sampleTimer = setInterval(() => {
    sampler.value = advanceReading(sampler.value, sampler.profile);
    sampler.outbox.push({ ts: new Date().toISOString(), value: sampler.value });
  }, sampleIntervalMs);
  return sampler.sampleTimer;
}

async function flushOutboxOnce(sampler, dispatch) {
  const dispatchDue = sampler.outbox.length > 0 && Date.now() - sampler.lastDispatch >= sampler.dispatchIntervalMs;
  if (!dispatchDue) return false;

  const drainedReadings = [];
  while (sampler.outbox.length > 0) drainedReadings.push(sampler.outbox.shift());

  try {
    await dispatch(drainedReadings);
    sampler.lastDispatch = Date.now();
    return true;
  } catch (err) {
    // Requeue the undelivered batch ahead of newer samples to keep arrival order.
    sampler.outbox = drainedReadings.concat(sampler.outbox);
    throw err;
  }
}

function beginDispatchLoop(sampler, dispatch, onError) {
  let halted = false;

  function cycle() {
    if (halted) return;
    flushOutboxOnce(sampler, dispatch)
      .catch((err) => {
        if (onError) onError(err);
      })
      .finally(() => {
        if (!halted) setImmediate(cycle);
      });
  }

  setImmediate(cycle);
  return () => {
    halted = true;
  };
}

function sendBatchToGateway(gatewayUrl, sensorType, siteId, unit, batch) {
  return fetch(gatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sensor_type: sensorType, site_id: siteId, unit, readings: batch }),
  });
}

function launchSensor() {
  const sensorType = process.env.SENSOR_TYPE;
  if (!sensorType) throw new Error("SENSOR_TYPE env var is required");
  const profile = PLANT_SENSOR_SPECS[sensorType];
  if (!profile) throw new Error(`unknown SENSOR_TYPE: ${sensorType}`);

  const siteId = process.env.SITE_ID || "plant-1";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const sampler = createSamplerState(sensorType, siteId, profile, dispatchInterval * 1000);
  console.log(`${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching opportunistically (>= ${dispatchInterval}s since last send)`);

  beginSampling(sampler, sampleInterval * 1000);
  beginDispatchLoop(
    sampler,
    (batch) => sendBatchToGateway(gatewayUrl, sensorType, siteId, profile.unit, batch).then(() => {
      console.log(`${sensorType}@${siteId} dispatched ${batch.length} reading(s)`);
    }),
    (err) => console.log(`${sensorType}@${siteId} dispatch failed, retaining batch: ${err.message}`)
  );
}

if (require.main === module) {
  launchSensor();
}

module.exports = { createSamplerState, beginSampling, flushOutboxOnce, beginDispatchLoop, sendBatchToGateway };
