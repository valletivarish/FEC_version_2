"use strict";

const { EventEmitter } = require("node:events");

// Event-driven buffering: an EventEmitter "reading" listener owns the Map and does the accumulation, decoupling ingestion from buffering via pub/sub rather than a direct in-line push from the request handler.
const KEY_DELIM = "::";

function keyOf(sensorType, siteId) {
  return sensorType + KEY_DELIM + siteId;
}

function splitKey(key) {
  const [sensorType, siteId] = key.split(KEY_DELIM);
  return { sensorType, siteId };
}

function createStation() {
  const emitter = new EventEmitter();
  const pending = new Map();
  const units = new Map();

  emitter.on("reading", ({ sensorType, siteId, unit, values }) => {
    const key = keyOf(sensorType, siteId);
    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(...values);
    if (unit) units.set(sensorType, unit);
  });

  function submit(sensorType, siteId, unit, values) {
    emitter.emit("reading", { sensorType, siteId, unit, values });
  }

  function snapshotAndClear() {
    const taken = new Map(pending);
    pending.clear();
    const unitsSnapshot = new Map(units);
    const groups = [];
    for (const [key, readings] of taken.entries()) {
      if (readings.length === 0) continue;
      const { sensorType, siteId } = splitKey(key);
      groups.push({ sensorType, siteId, unit: unitsSnapshot.get(sensorType) || "", readings });
    }
    return groups;
  }

  return { emitter, submit, snapshotAndClear };
}

module.exports = { createStation, keyOf, splitKey };
