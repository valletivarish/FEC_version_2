"use strict";

const HIVE_RING_CAPACITY = 64;
const HIVE_KEY_DELIM = "::";

function hiveKeyOf(sensorType, siteId) {
  return `${sensorType}${HIVE_KEY_DELIM}${siteId}`;
}

function splitHiveKey(key) {
  const [sensorType, siteId] = key.split(HIVE_KEY_DELIM);
  return { sensorType, siteId };
}

function createApiaryStation(capacity = HIVE_RING_CAPACITY) {
  return { rings: new Map(), units: new Map(), capacity };
}

function openHiveRing(capacity) {
  return {
    values: new Float64Array(capacity),
    timestamps: new Array(capacity).fill(null),
    writeIndex: 0,
    count: 0,
    capacity,
  };
}

// A write past capacity silently overwrites the oldest still-unflushed slot; the window timer drains each ring long before it wraps.
function pushHiveReading(ring, value, ts) {
  ring.values[ring.writeIndex] = value;
  ring.timestamps[ring.writeIndex] = ts;
  ring.writeIndex = (ring.writeIndex + 1) % ring.capacity;
  if (ring.count < ring.capacity) ring.count += 1;
}

// Oldest-first order, so aggregation's "latest" stays last-in-order even after a wrap.
function hiveRingInOrder(ring) {
  const indices = [];
  if (ring.count < ring.capacity) {
    for (let i = 0; i < ring.count; i++) indices.push(i);
  } else {
    for (let i = 0; i < ring.capacity; i++) indices.push((ring.writeIndex + i) % ring.capacity);
  }
  return indices.map((i) => ({ ts: ring.timestamps[i], value: ring.values[i] }));
}

function depositReadings(station, sensorType, siteId, unit, readings) {
  const key = hiveKeyOf(sensorType, siteId);
  let ring = station.rings.get(key);
  if (!ring) {
    ring = openHiveRing(station.capacity);
    station.rings.set(key, ring);
  }
  for (const reading of readings) pushHiveReading(ring, reading.value, reading.ts);
  if (unit) station.units.set(sensorType, unit);
}

function harvestAndReset(station) {
  const groups = [];
  for (const [key, ring] of station.rings.entries()) {
    if (ring.count === 0) continue;
    const { sensorType, siteId } = splitHiveKey(key);
    groups.push({
      sensorType,
      siteId,
      unit: station.units.get(sensorType) || "",
      readings: hiveRingInOrder(ring),
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
  HIVE_RING_CAPACITY,
  createApiaryStation,
  openHiveRing,
  pushHiveReading,
  hiveRingInOrder,
  depositReadings,
  harvestAndReset,
  hiveKeyOf,
  splitHiveKey,
};
