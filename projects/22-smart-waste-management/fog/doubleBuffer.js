"use strict";

// Grouped-at-ingest double buffer. addReading() writes straight into a
// per-(sensor_type, site_id) array the moment a reading lands, the same
// "group immediately at ingest" idea 03-patient-vitals and
// 18-elevator-escalator-fleet-monitoring both use. What differs is entirely
// how the window flush drains the structure:
//   - 03's flushWindow does `new Map(app.locals.pending)` (a shallow copy
//     of the entries into a *new* Map) and then calls `.clear()` on the
//     *original* live Map -- two operations against the live object every
//     flush.
//   - 18's takeSnapshot() walks the one-and-only live Map directly to build
//     the group list, then calls `.clear()` on that same object in place --
//     one object, mutated in place, for the whole life of the process.
//   - 11-water-treatment-utility defers ALL grouping to flush time over a
//     flat ledger array; 06 never keeps a raw list at all (streaming fold);
//     10 buffers via an EventEmitter listener into a Map; 15 uses a
//     fixed-capacity ring buffer per key.
// This module instead swaps the `active` Map reference itself: swapAndDrain
// installs a brand-new empty Map as the live buffer in one assignment and
// hands the previous Map back to the caller to walk. The Map being walked
// is never touched again by addReading() -- it is not copied, not cleared,
// just left for the caller to read and then let the garbage collector
// reclaim. Any reading that arrives during (or after) the walk lands in the
// fresh Map, so ingest and drain never operate on the same object.
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
