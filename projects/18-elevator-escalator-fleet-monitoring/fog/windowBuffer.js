"use strict";

// Groups readings at ingest via a Map keyed on "sensor_type::site_id"; distinct among sibling fog buffers because flushing is driven by scheduler.js's recursive async Promise-chain tick loop rather than setInterval/setTimeout.
function createBuffer() {
  return new Map();
}

function bufferKey(sensorType, siteId) {
  return `${sensorType}::${siteId}`;
}

function addReading(buffer, sensorType, siteId, reading) {
  const key = bufferKey(sensorType, siteId);
  if (!buffer.has(key)) buffer.set(key, []);
  buffer.get(key).push(reading);
}

// Snapshot-and-clear: hands back every non-empty group as
// {sensorType, siteId, readings} and empties the live Map in the same call,
// so readings arriving immediately after this returns start a fresh group
// rather than leaking into the window just sealed.
function takeSnapshot(buffer) {
  const groups = [];
  for (const [key, readings] of buffer.entries()) {
    if (readings.length === 0) continue;
    const separatorIndex = key.indexOf("::");
    groups.push({
      sensorType: key.slice(0, separatorIndex),
      siteId: key.slice(separatorIndex + 2),
      readings,
    });
  }
  buffer.clear();
  return groups;
}

module.exports = { createBuffer, bufferKey, addReading, takeSnapshot };
