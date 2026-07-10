"use strict";

const { EventEmitter } = require("node:events");

// Event-driven buffering: the HTTP handler in app.js only validates the
// request body and emits a "reading" event -- it never touches the buffer
// directly. A single listener subscribed here owns the Map and does the
// actual accumulation. This decouples ingestion from buffering via pub/sub,
// distinct from both 03 (the Express handler pushes straight into a shared
// buffer-then-reduce object) and 06 (the router calls a streaming-accumulator
// module function directly). Readings are retained as a raw array per key
// (same buffer-then-reduce style as 03 at the storage level), so the
// aggregation math in aggregation.js runs once at flush time over the whole
// array -- the event-driven dispatch is the differentiator here, not the
// per-value fold.
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
