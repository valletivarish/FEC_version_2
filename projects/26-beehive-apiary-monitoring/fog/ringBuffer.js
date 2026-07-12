"use strict";

// Fixed-size ring buffer backed by a real Float64Array typed array, one per
// (sensor_type, site_id) key, pre-allocated to RING_CAPACITY slots with a
// manually tracked write-index that wraps via modulo. This is the only
// buffering implementation in the whole portfolio backed by a real
// TypedArray -- every other Node sibling's buffer is built from plain
// JS objects/arrays/Maps: 03-patient-vitals groups into a push()-growing
// shared array-per-key object at ingest time; 06-offshore-wind-farm folds
// each value into a live streaming accumulator and never keeps a raw list
// at all; 10-wildfire-forest-monitoring buffers into a Map via an
// EventEmitter "reading" listener; 11-water-treatment-utility defers ALL
// grouping to flush time over one flat write-ahead-log array; 15-data-
// center-environmental-monitoring's ring buffer is a plain
// `new Array(capacity).fill(null)`, not a typed array; 18-elevator-
// escalator-fleet-monitoring writes straight into a plain Map<key, array>
// at ingest (its novelty is entirely in flush scheduling, not storage); and
// 22-smart-waste-management swaps a Map reference wholesale at flush
// (double buffer).
//
// A Float64Array can only hold the numeric value itself -- it has no room
// for a string -- so a parallel plain array of equal length carries the ISO
// timestamp for each slot. The two arrays share one write-index and one
// wraparound scheme; there is no array of {ts, value} objects anywhere in
// this module, just two fixed-length parallel arrays addressed by the same
// index.
const RING_CAPACITY = 64;
const KEY_DELIM = "::";

function keyOf(sensorType, siteId) {
  return `${sensorType}${KEY_DELIM}${siteId}`;
}

function splitKey(key) {
  const [sensorType, siteId] = key.split(KEY_DELIM);
  return { sensorType, siteId };
}

function createStation(capacity = RING_CAPACITY) {
  return { rings: new Map(), units: new Map(), capacity };
}

function openRing(capacity) {
  return {
    values: new Float64Array(capacity),
    timestamps: new Array(capacity).fill(null),
    writeIndex: 0,
    count: 0,
    capacity,
  };
}

// The one and only mutation primitive: write one (value, ts) pair at
// writeIndex across both parallel arrays, then advance writeIndex with
// wraparound. count saturates at capacity once the ring has wrapped at
// least once. A write beyond capacity silently overwrites the oldest
// still-unflushed slot -- an explicit, documented trade-off of a fixed-size
// ring, not a bug. The window timer is expected to drain every ring long
// before it wraps in normal operation.
function ringPush(ring, value, ts) {
  ring.values[ring.writeIndex] = value;
  ring.timestamps[ring.writeIndex] = ts;
  ring.writeIndex = (ring.writeIndex + 1) % ring.capacity;
  if (ring.count < ring.capacity) ring.count += 1;
}

// Reads the ring back out in original write order (oldest first), zipping
// each Float64Array slot with its parallel timestamp slot. Needed so
// aggregation's "latest" (last-in-order, not max-timestamp) stays correct
// even after the ring has wrapped and writeIndex no longer points at slot 0.
function ringToOrderedReadings(ring) {
  const indices = [];
  if (ring.count < ring.capacity) {
    for (let i = 0; i < ring.count; i++) indices.push(i);
  } else {
    for (let i = 0; i < ring.capacity; i++) indices.push((ring.writeIndex + i) % ring.capacity);
  }
  return indices.map((i) => ({ ts: ring.timestamps[i], value: ring.values[i] }));
}

function submit(station, sensorType, siteId, unit, readings) {
  const key = keyOf(sensorType, siteId);
  let ring = station.rings.get(key);
  if (!ring) {
    ring = openRing(station.capacity);
    station.rings.set(key, ring);
  }
  for (const reading of readings) ringPush(ring, reading.value, reading.ts);
  if (unit) station.units.set(sensorType, unit);
}

// Snapshots every non-empty ring into ordered-array groups, then flushes and
// resets each ring in place (write-index and count back to zero, slots
// cleared) so the next window starts writing from slot 0 again.
function snapshotAndClear(station) {
  const groups = [];
  for (const [key, ring] of station.rings.entries()) {
    if (ring.count === 0) continue;
    const { sensorType, siteId } = splitKey(key);
    groups.push({
      sensorType,
      siteId,
      unit: station.units.get(sensorType) || "",
      readings: ringToOrderedReadings(ring),
    });
  }
  for (const ring of station.rings.values()) {
    ring.values.fill(0);
    ring.timestamps.fill(null);
    ring.writeIndex = 0;
    ring.count = 0;
  }
  return groups;
}

module.exports = {
  RING_CAPACITY,
  createStation,
  openRing,
  ringPush,
  ringToOrderedReadings,
  submit,
  snapshotAndClear,
  keyOf,
  splitKey,
};
