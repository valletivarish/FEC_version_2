"use strict";

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
