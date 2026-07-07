"use strict";

const { SENSOR_PROFILES, nextReading } = require("./profiles");

function buildRig(config) {
  const outbox = [];
  let level = config.profile.start;
  let lastFlush = Date.now();

  function sample() {
    level = nextReading(level, config.profile);
    outbox.push({ ts: new Date().toISOString(), value: level });
  }

  function dueForFlush() {
    return outbox.length > 0 && (Date.now() - lastFlush) / 1000 >= config.dispatchInterval;
  }

  async function flush(post) {
    const batch = outbox.splice(0, outbox.length);
    try {
      await post(batch);
      lastFlush = Date.now();
      console.log(`${config.sensorType}@${config.siteId} sent ${batch.length} reading(s)`);
    } catch (err) {
      outbox.unshift(...batch);
      console.log(`${config.sensorType}@${config.siteId} dispatch failed (${err.message}), retaining ${batch.length}`);
    }
  }

  return { sample, dueForFlush, flush };
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

  const siteId = process.env.SITE_ID || "turbine-1";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const rig = buildRig({ sensorType, siteId, profile, dispatchInterval });
  console.log(`${sensorType}@${siteId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s`);

  setInterval(() => {
    rig.sample();
    if (rig.dueForFlush()) {
      rig.flush((batch) => postBatch(gatewayUrl, sensorType, siteId, profile.unit, batch));
    }
  }, sampleInterval * 1000);
}

if (require.main === module) {
  start();
}

module.exports = { buildRig, postBatch };
