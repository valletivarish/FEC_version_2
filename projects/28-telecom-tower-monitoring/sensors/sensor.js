import process from "node:process";
import { fileURLToPath } from "node:url";

const TYPE = process.env.SENSOR_TYPE;
const SITE = process.env.SITE_ID || "site-north";
const SAMPLE_MS = Number(process.env.SAMPLE_INTERVAL || 2) * 1000;
const DISPATCH_MS = Number(process.env.DISPATCH_INTERVAL || 10) * 1000;
const FOG_URL = process.env.FOG_URL || "http://fog:8000/ingest";

const PROFILES = {
  dc_load_amps: { unit: "A", low: 5, high: 72 },
  battery_charge_pct: { unit: "%", low: 0, high: 100 },
  genset_fuel_pct: { unit: "%", low: 0, high: 100 },
  cabinet_temp_c: { unit: "degC", low: 10, high: 60 },
  rf_utilization_pct: { unit: "%", low: 0, high: 100 },
};

const TWO_PI = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const noise = (spread) => (Math.random() - 0.5) * 2 * spread;

// Each signal is a deterministic waveform advanced by a tick counter, plus a
// low-probability excursion so the live board occasionally crosses an alarm.
function generatorFor(type) {
  let tick = Math.floor(Math.random() * 720);
  const dayCurve = () => 0.5 + 0.5 * Math.sin(TWO_PI * (tick / 720) - Math.PI / 2);

  switch (type) {
    case "dc_load_amps": {
      return () => {
        tick += 1;
        const surge = Math.random() < 0.02 ? 14 : 0;
        return 30 + 14 * dayCurve() + surge + noise(1.4);
      };
    }
    case "battery_charge_pct": {
      // Triangle charge/discharge cycle; occasional grid-loss deep discharge.
      let deep = 0;
      return () => {
        tick += 1;
        const phase = (tick % 900) / 900;
        const triangle = phase < 0.35 ? 100 - (phase / 0.35) * 55 : 45 + ((phase - 0.35) / 0.65) * 55;
        if (deep > 0) deep -= 1;
        else if (Math.random() < 0.01) deep = 30;
        return triangle - (deep > 0 ? 40 : 0) + noise(1.0);
      };
    }
    case "genset_fuel_pct": {
      // Slow downward sawtooth with periodic refuel back to full.
      return () => {
        tick += 1;
        const burn = (tick % 1100) / 1100;
        const dip = Math.random() < 0.015 ? 12 : 0;
        return 100 - burn * 82 - dip + noise(0.6);
      };
    }
    case "cabinet_temp_c": {
      return () => {
        tick += 1;
        const spike = Math.random() < 0.02 ? 12 : 0;
        return 30 + 8 * dayCurve() + spike + noise(0.7);
      };
    }
    case "rf_utilization_pct": {
      // Twin busy-hour peaks (morning + evening) over the daily tick cycle.
      return () => {
        tick += 1;
        const t = (tick % 720) / 720;
        const busy = (c) => Math.exp(-((t - c) ** 2) / 0.006);
        return 25 + 60 * (busy(0.35) + busy(0.78)) + noise(2.0);
      };
    }
    default:
      throw new Error(`unknown SENSOR_TYPE: ${type}`);
  }
}

async function dispatch(buffer, profile) {
  if (buffer.length === 0) return buffer;
  const envelope = { sensor_type: TYPE, site_id: SITE, unit: profile.unit, readings: buffer };
  try {
    const res = await fetch(FOG_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
    if (!res.ok) throw new Error(`fog responded ${res.status}`);
    return [];
  } catch (err) {
    console.error(`[${TYPE}/${SITE}] dispatch failed, retaining ${buffer.length} readings: ${err.message}`);
    return buffer;
  }
}

async function main() {
  if (!PROFILES[TYPE]) throw new Error(`SENSOR_TYPE must be one of ${Object.keys(PROFILES).join(", ")}`);
  const profile = PROFILES[TYPE];
  const nextValue = generatorFor(TYPE);
  let buffer = [];

  setInterval(() => {
    const value = Math.round(clamp(nextValue(), profile.low, profile.high) * 100) / 100;
    buffer.push({ ts: new Date().toISOString(), value });
  }, SAMPLE_MS);

  setInterval(async () => {
    buffer = await dispatch(buffer, profile);
  }, DISPATCH_MS);

  console.log(`[${TYPE}/${SITE}] sampling every ${SAMPLE_MS}ms, dispatching every ${DISPATCH_MS}ms to ${FOG_URL}`);
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { generatorFor, dispatch, PROFILES };
