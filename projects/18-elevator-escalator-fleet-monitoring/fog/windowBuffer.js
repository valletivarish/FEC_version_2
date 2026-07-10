"use strict";

// The buffer is a plain Map<string, Array<{ts, value}>>, written to
// directly by /ingest's handleIngest (in app.js) the instant a reading
// arrives -- there is no separate write-ahead-log stage (contrast
// 11-water-treatment-utility's flat ledger.js, which defers all grouping
// to flush time) and no streaming fold (06's accumulator.js) and no
// EventEmitter indirection (10's buffer.js). Grouping-by-key already
// happens here, at ingest, simply by using "sensor_type::site_id" as the
// Map key -- what makes this project's buffering genuinely different from
// 03-patient-vitals (which also groups at ingest into a per-key array) is
// entirely in *how the flush cycle is scheduled*: see scheduler.js's
// recursive async Promise-chain tick loop, used instead of any of the four
// siblings' setInterval/setTimeout-based flush timers.
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
