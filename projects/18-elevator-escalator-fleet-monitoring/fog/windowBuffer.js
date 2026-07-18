"use strict";

// Groups readings at ingest into a Map keyed on "sensor_type::site_id".
function openRunLedger() {
  return new Map();
}

function runLedgerKey(sensorType, siteId) {
  return `${sensorType}::${siteId}`;
}

function logReading(ledger, sensorType, siteId, reading) {
  const key = runLedgerKey(sensorType, siteId);
  if (!ledger.has(key)) ledger.set(key, []);
  ledger.get(key).push(reading);
}

// Hands back every non-empty group and empties the live Map in the same call.
function drainRunLedger(ledger) {
  const groups = [];
  for (const [key, readings] of ledger.entries()) {
    if (readings.length === 0) continue;
    const separatorIndex = key.indexOf("::");
    groups.push({
      sensorType: key.slice(0, separatorIndex),
      siteId: key.slice(separatorIndex + 2),
      readings,
    });
  }
  ledger.clear();
  return groups;
}

module.exports = { openRunLedger, runLedgerKey, logReading, drainRunLedger };
