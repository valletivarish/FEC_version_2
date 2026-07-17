"use strict";

const { HIVE_SIGNAL_SPECS, stepHiveSignal } = require("./profiles");

function initHiveProbe(sensorType, siteId, spec, dispatchIntervalMs) {
  return {
    sensorType,
    siteId,
    spec,
    value: spec.start,
    outbox: [],
    lastDispatch: Date.now(),
    dispatchIntervalMs,
  };
}

// One random-walk step, then an opportunistic dispatch check (a Date.now()
// comparison, not a countdown). Returns the in-flight dispatch promise when a
// send was attempted, or null when this tick only sampled.
function sampleAndFlushHive(probe, dispatch) {
  probe.value = stepHiveSignal(probe.value, probe.spec);
  probe.outbox.push({ ts: new Date().toISOString(), value: probe.value });

  const flushDue = probe.outbox.length > 0 && Date.now() - probe.lastDispatch >= probe.dispatchIntervalMs;
  if (!flushDue) return null;

  const queued = probe.outbox;
  probe.outbox = [];
  return dispatch(queued).then(
    () => {
      probe.lastDispatch = Date.now();
    },
    (err) => {
      // Preserve arrival order: samples taken while the failed send was in flight go after the restored batch.
      probe.outbox = queued.concat(probe.outbox);
      throw err;
    }
  );
}

function runHiveSamplerLoop(probe, sampleIntervalMs, dispatch, onError) {
  let halted = false;
  let pendingTimer = null;

  function armHiveTick() {
    if (halted) return;
    pendingTimer = setTimeout(() => {
      queueMicrotask(() => {
        if (halted) return;
        const inFlight = sampleAndFlushHive(probe, dispatch);
        if (inFlight) inFlight.catch((err) => onError && onError(err));
        armHiveTick();
      });
    }, sampleIntervalMs);
  }

  armHiveTick();
  return function stop() {
    halted = true;
    if (pendingTimer) clearTimeout(pendingTimer);
  };
}

function shipBatchToFog(gatewayUrl, sensorType, siteId, unit, batch) {
  return fetch(gatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sensor_type: sensorType, site_id: siteId, unit, readings: batch }),
  });
}

function launchHiveProbe() {
  const sensorType = process.env.SENSOR_TYPE;
  if (!sensorType) throw new Error("SENSOR_TYPE env var is required");
  const spec = HIVE_SIGNAL_SPECS[sensorType];
  if (!spec) throw new Error(`unknown SENSOR_TYPE: ${sensorType}`);

  const siteId = process.env.SITE_ID || "apiary-a";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const probe = initHiveProbe(sensorType, siteId, spec, dispatchInterval * 1000);
  console.log(
    `${sensorType}@${siteId} sampling every ${sampleInterval}s (setTimeout macrotask + queueMicrotask tick), ` +
      `dispatching opportunistically (>= ${dispatchInterval}s since last send)`
  );

  runHiveSamplerLoop(
    probe,
    sampleInterval * 1000,
    (batch) => shipBatchToFog(gatewayUrl, sensorType, siteId, spec.unit, batch).then(() => {
      console.log(`${sensorType}@${siteId} dispatched ${batch.length} reading(s)`);
    }),
    (err) => console.log(`${sensorType}@${siteId} dispatch failed, retaining batch: ${err.message}`)
  );
}

if (require.main === module) {
  launchHiveProbe();
}

module.exports = { initHiveProbe, sampleAndFlushHive, runHiveSamplerLoop, shipBatchToFog };
