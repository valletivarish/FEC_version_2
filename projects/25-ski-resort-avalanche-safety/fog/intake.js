"use strict";

// Fog buffering as a plain JS object literal -- {} -- keyed by
// "sensor_type::site_id" strings, whose values are plain arrays of raw
// readings, grouped by key at ingest time (addReading below writes straight
// into the right array the moment a reading arrives; there is no deferred
// grouping step at flush time). This is a genuinely different top-level
// container from every sibling Node fog service in this portfolio:
// 03-patient-vitals groups at ingest into a Map (app.locals.pending);
// 06-offshore-wind-farm folds each value into a live streaming accumulator
// and never keeps a raw list; 10-wildfire-forest-monitoring groups into a
// Map via an EventEmitter "reading" listener; 11-water-treatment-utility
// defers ALL grouping to flush time over one flat write-ahead-log array;
// 15-data-center-environmental-monitoring uses a fixed-capacity ring-buffer
// array per key; 18-elevator-escalator-fleet-monitoring groups at ingest
// into a Map cleared in place; 22-smart-waste-management groups at ingest
// into a Map and swaps the whole Map reference at flush (double buffer).
// None of the seven uses a bare `{}` object literal as the top-level
// container -- here station.groups is exactly that, with Object.keys() used
// to walk it and a fresh `{}` assigned back to station.groups on flush.
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
