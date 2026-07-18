"use strict";

// Fog buffering keyed by a bare `{}` object literal grouped at ingest time via Object.keys().
function createStation() {
  return { groups: {}, units: {} };
}

const KEY_DELIM = "::";

function keyOf(sensorType, siteId) {
  return `${sensorType}${KEY_DELIM}${siteId}`;
}

function splitKey(key) {
  const separatorIndex = key.indexOf(KEY_DELIM);
  return { sensorType: key.slice(0, separatorIndex), siteId: key.slice(separatorIndex + KEY_DELIM.length) };
}

function addReading(station, sensorType, siteId, unit, reading) {
  const key = keyOf(sensorType, siteId);
  if (!station.groups[key]) station.groups[key] = [];
  station.groups[key].push(reading);
  if (unit) station.units[sensorType] = unit;
}

// Snapshot every non-empty key into a {sensorType, siteId, unit, readings}
// group, then reset the object literal to a fresh {} so readings arriving
// immediately after this call start a new window rather than leaking into
// the one just sealed.
function snapshotAndClear(station) {
  const groups = [];
  for (const key of Object.keys(station.groups)) {
    const readings = station.groups[key];
    if (readings.length === 0) continue;
    const { sensorType, siteId } = splitKey(key);
    groups.push({ sensorType, siteId, unit: station.units[sensorType] || "", readings });
  }
  station.groups = {};
  return groups;
}

module.exports = { createStation, keyOf, splitKey, addReading, snapshotAndClear };
