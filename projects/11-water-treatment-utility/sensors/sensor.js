"use strict";

const { PLANT_SENSOR_SPECS, advanceReading } = require("./profiles");

// Dispatch is opportunistic/event-loop-driven rather than timer-driven -- a recursive setImmediate loop only sends when the outbox is non-empty and Date.now() - lastDispatch >= dispatchIntervalMs, the 4th distinct scheduling idiom in this portfolio (vs 03's single setInterval, 06's polled "rig" object, 10's two setTimeout loops).
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

// One check-and-maybe-drain step. Kept separate from the recursive loop
// below so tests can call it directly against a controlled state object
// instead of racing real timers. Uses Array.prototype.shift() to drain the
// outbox in strict arrival order.
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
    // Put the undelivered batch back in front of anything sampled while the
    // dispatch attempt was in flight, preserving arrival order.
    sampler.outbox = drainedReadings.concat(sampler.outbox);
    throw err;
  }
}

// The perpetual opportunistic loop: reschedule via setImmediate forever,
// only ever doing real work when flushOutboxOnce() decides it is due. Returns a
// stop function so callers (and tests) can halt it cleanly.
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
