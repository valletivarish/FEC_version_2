"use strict";

// Reference-swap double buffer: swapAndDrain hands off the live `active` Map wholesale and installs a fresh empty one in a single assignment, rather than copying or clearing in place.
function createDoubleBuffer() {
  return { active: new Map(), units: new Map() };
}

function bufferKey(sensorType, siteId) {
  return `${sensorType}::${siteId}`;
}

function addReading(db, sensorType, siteId, unit, reading) {
  const key = bufferKey(sensorType, siteId);
  if (!db.active.has(key)) db.active.set(key, []);
  db.active.get(key).push(reading);
  if (unit) db.units.set(sensorType, unit);
}

function swapAndDrain(db) {
  const draining = db.active;
  db.active = new Map();
  const units = db.units;

  const groups = [];
  for (const [key, readings] of draining.entries()) {
    if (readings.length === 0) continue;
    const separatorIndex = key.indexOf("::");
    groups.push({
      sensorType: key.slice(0, separatorIndex),
      siteId: key.slice(separatorIndex + 2),
      unit: units.get(key.slice(0, separatorIndex)) || "",
      readings,
    });
  }
  return groups;
}

module.exports = { createDoubleBuffer, bufferKey, addReading, swapAndDrain };
