"use strict";

const { VITAL_PROFILES, stepValue } = require("./lib");

async function run() {
  const vital = process.env.SENSOR_TYPE;
  if (!vital) throw new Error("SENSOR_TYPE env var is required");
  const patientId = process.env.SITE_ID || "patient-1";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const profile = VITAL_PROFILES[vital];
  if (!profile) throw new Error(`unknown SENSOR_TYPE: ${vital}`);

  let value = profile.start;
  let pending = [];
  let lastSent = Date.now();

  console.log(`${vital}@${patientId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s`);

  setInterval(async () => {
    value = stepValue(value, profile);
    pending.push({ ts: new Date().toISOString(), value });

    if ((Date.now() - lastSent) / 1000 >= dispatchInterval && pending.length > 0) {
      const payload = { sensor_type: vital, site_id: patientId, unit: profile.unit, readings: pending };
      const toSend = pending;
      pending = [];
      try {
        await fetch(gatewayUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        console.log(`${vital} dispatched ${toSend.length} readings`);
        lastSent = Date.now();
      } catch (err) {
        console.log(`${vital} dispatch failed, will retry: ${err.message}`);
        pending = toSend.concat(pending);
      }
    }
  }, sampleInterval * 1000);
}

if (require.main === module) {
  run();
}

module.exports = { run };
