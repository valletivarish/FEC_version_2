"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  HIVE_RING_CAPACITY,
  createApiaryStation,
  openHiveRing,
  pushHiveReading,
  hiveRingInOrder,
  depositReadings,
  harvestAndReset,
  hiveKeyOf,
  splitHiveKey,
} = require("./ringBuffer");

test("openHiveRing allocates a real Float64Array of the requested capacity", () => {
  const ring = openHiveRing(8);
  assert.ok(ring.values instanceof Float64Array);
  assert.equal(ring.values.length, 8);
  assert.equal(ring.timestamps.length, 8);
  assert.equal(ring.writeIndex, 0);
  assert.equal(ring.count, 0);
});

test("pushHiveReading writes value/timestamp pairs and advances writeIndex", () => {
  const ring = openHiveRing(4);
  pushHiveReading(ring, 34.5, "t0");
  pushHiveReading(ring, 34.8, "t1");
  assert.equal(ring.values[0], 34.5);
  assert.equal(ring.timestamps[0], "t0");
  assert.equal(ring.values[1], 34.8);
  assert.equal(ring.writeIndex, 2);
  assert.equal(ring.count, 2);
});

test("pushHiveReading wraps the write index via modulo once capacity is exceeded", () => {
  const ring = openHiveRing(3);
  pushHiveReading(ring, 1, "t0");
  pushHiveReading(ring, 2, "t1");
  pushHiveReading(ring, 3, "t2");
  pushHiveReading(ring, 4, "t3"); // overwrites slot 0
  assert.equal(ring.writeIndex, 1);
  assert.equal(ring.count, 3, "count saturates at capacity");
  assert.equal(ring.values[0], 4, "slot 0 was overwritten by the 4th write");
});

test("hiveRingInOrder returns oldest-first order before the ring has wrapped", () => {
  const ring = openHiveRing(5);
  pushHiveReading(ring, 10, "t0");
  pushHiveReading(ring, 20, "t1");
  pushHiveReading(ring, 30, "t2");
  const readings = hiveRingInOrder(ring);
  assert.deepEqual(readings.map((r) => r.value), [10, 20, 30]);
  assert.deepEqual(readings.map((r) => r.ts), ["t0", "t1", "t2"]);
});

test("hiveRingInOrder stays oldest-first after wraparound, so latest = last-in-order", () => {
  const ring = openHiveRing(3);
  pushHiveReading(ring, 1, "t0");
  pushHiveReading(ring, 2, "t1");
  pushHiveReading(ring, 3, "t2");
  pushHiveReading(ring, 4, "t3"); // wraps: oldest remaining is value 2 (t1)
  const readings = hiveRingInOrder(ring);
  assert.deepEqual(readings.map((r) => r.value), [2, 3, 4]);
  assert.equal(readings[readings.length - 1].value, 4, "latest must be last-in-order, not max value");
});

test("hiveKeyOf/splitHiveKey round-trip sensor_type and site_id", () => {
  const key = hiveKeyOf("hive_weight_kg", "apiary-a");
  assert.equal(key, "hive_weight_kg::apiary-a");
  assert.deepEqual(splitHiveKey(key), { sensorType: "hive_weight_kg", siteId: "apiary-a" });
});

test("depositReadings lazily opens one ring per (sensor_type, site_id) key", () => {
  const station = createApiaryStation(10);
  depositReadings(station, "hive_weight_kg", "apiary-a", "kg", [{ ts: "t0", value: 35 }]);
  depositReadings(station, "hive_weight_kg", "apiary-b", "kg", [{ ts: "t0", value: 40 }]);
  assert.equal(station.rings.size, 2);
  assert.equal(station.units.get("hive_weight_kg"), "kg");
});

test("harvestAndReset groups non-empty rings and resets them for the next window", () => {
  const station = createApiaryStation(10);
  depositReadings(station, "internal_hive_temp_c", "apiary-a", "C", [{ ts: "t0", value: 34 }, { ts: "t1", value: 34.5 }]);
  depositReadings(station, "internal_hive_temp_c", "apiary-b", "C", [{ ts: "t0", value: 33 }]);

  const groups = harvestAndReset(station);
  assert.equal(groups.length, 2);
  const a = groups.find((g) => g.siteId === "apiary-a");
  assert.equal(a.readings.length, 2);
  assert.equal(a.unit, "C");

  const ringA = station.rings.get(hiveKeyOf("internal_hive_temp_c", "apiary-a"));
  assert.equal(ringA.count, 0, "ring must be reset after harvestAndReset");
  assert.equal(ringA.writeIndex, 0);
});

test("harvestAndReset skips rings with count 0", () => {
  const station = createApiaryStation(10);
  station.rings.set(hiveKeyOf("hive_weight_kg", "apiary-a"), openHiveRing(10));
  const groups = harvestAndReset(station);
  assert.equal(groups.length, 0);
});

test("a ring surviving a full wraparound still reports every configured slot in HIVE_RING_CAPACITY", () => {
  const station = createApiaryStation(HIVE_RING_CAPACITY);
  const readings = [];
  for (let i = 0; i < HIVE_RING_CAPACITY + 10; i++) readings.push({ ts: `t${i}`, value: i });
  depositReadings(station, "acoustic_buzz_frequency_hz", "apiary-a", "Hz", readings);
  const groups = harvestAndReset(station);
  assert.equal(groups[0].readings.length, HIVE_RING_CAPACITY, "capacity caps the readings retained, oldest dropped");
  assert.equal(groups[0].readings[groups[0].readings.length - 1].value, HIVE_RING_CAPACITY + 9);
});
