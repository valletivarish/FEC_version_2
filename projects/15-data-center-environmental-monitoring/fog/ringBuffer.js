"use strict";

// Fixed-size ring buffer: a plain JS array of length RING_CAPACITY per
// (sensor_type, site_id) key, with a manually tracked write-index that
// wraps around via modulo. Genuinely different accumulation strategy from
// every other Node sibling in this portfolio: 03-patient-vitals buffers
// into a push()-growing shared array-per-key, 06-offshore-wind-farm folds
// each value into a live streaming accumulator (no raw list kept at all),
// 10-wildfire-forest-monitoring buffers into a Map via an EventEmitter
// "reading" event, and 11-water-treatment-utility defers ALL grouping to
// flush time over one flat write-ahead-log array. Here storage is fixed
// capacity from the moment a key is first seen: a write beyond
// RING_CAPACITY overwrites the oldest still-unflushed slot. The window
// timer is expected to drain every ring long before it wraps in normal
// operation; wrapping only silently drops the oldest unflushed reading
// under sustained overload, an explicit, documented trade-off of choosing
// a ring buffer, not a bug.
const RING_CAPACITY = 256;
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
  return { slots: new Array(capacity).fill(null), writeIndex: 0, count: 0, capacity };
}

// The one and only mutation primitive: write one value at writeIndex, then
// advance writeIndex with wraparound. count saturates at capacity once the
// ring has wrapped at least once.
function ringPush(ring, value) {
  ring.slots[ring.writeIndex] = value;
  ring.writeIndex = (ring.writeIndex + 1) % ring.capacity;
  if (ring.count < ring.capacity) ring.count += 1;
}

// Reads the ring back out in original write order (oldest first). Needed
// so aggregation's "latest" (last-in-order, not max-timestamp) stays
// correct even after the ring has wrapped and writeIndex no longer points
// at slot 0.
function ringToOrderedArray(ring) {
  if (ring.count < ring.capacity) {
    return ring.slots.slice(0, ring.count);
  }
  return ring.slots.slice(ring.writeIndex).concat(ring.slots.slice(0, ring.writeIndex));
}

function submit(station, sensorType, siteId, unit, readings) {
  const key = keyOf(sensorType, siteId);
  let ring = station.rings.get(key);
  if (!ring) {
    ring = openRing(station.capacity);
    station.rings.set(key, ring);
  }
  for (const reading of readings) ringPush(ring, reading);
  if (unit) station.units.set(sensorType, unit);
}

// Snapshots every non-empty ring into ordered-array groups, then flushes
// and resets each ring in place (write-index and count back to zero) so
// the next window starts writing from slot 0 again -- exactly the
// "flushed and reset on each window timer tick" behaviour required of a
// ring buffer used as a windowing structure.
function snapshotAndClear(station) {
  const groups = [];
  for (const [key, ring] of station.rings.entries()) {
    if (ring.count === 0) continue;
    const { sensorType, siteId } = splitKey(key);
    groups.push({
      sensorType,
      siteId,
      unit: station.units.get(sensorType) || "",
      readings: ringToOrderedArray(ring),
    });
  }
  for (const ring of station.rings.values()) {
    ring.slots.fill(null);
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
  ringToOrderedArray,
  submit,
  snapshotAndClear,
  keyOf,
  splitKey,
};
