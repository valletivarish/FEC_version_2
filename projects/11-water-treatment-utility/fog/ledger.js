"use strict";

// Two-phase buffering: raw entries append to a flat array at ingest with grouping/aggregation deferred entirely to flush -- the fourth distinct fog-buffering idiom in this portfolio, vs. 03/06/10's group-at-ingest, live-fold, and event-dispatched approaches.
function openReadingBuffer() {
  return { entries: [] };
}

function bufferReading(ledger, entry) {
  ledger.entries.push(entry);
}

function flushBuffer(ledger) {
  const taken = ledger.entries;
  ledger.entries = [];
  return taken;
}

// Pure grouping function run once at flush time over the whole drained
// entry list, never incrementally maintained during ingest.
function clusterByPlantSensor(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.sensorType}::${entry.siteId}`;
    if (!groups.has(key)) {
      groups.set(key, { sensorType: entry.sensorType, siteId: entry.siteId, unit: entry.unit, readings: [] });
    }
    groups.get(key).readings.push({ ts: entry.ts, value: entry.value });
  }
  return Array.from(groups.values());
}

module.exports = { openReadingBuffer, bufferReading, flushBuffer, clusterByPlantSensor };
