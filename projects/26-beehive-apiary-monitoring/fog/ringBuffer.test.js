"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RING_CAPACITY,
  createStation,
  openRing,
  ringPush,
  ringToOrderedReadings,
  submit,
  snapshotAndClear,
  keyOf,
  splitKey,
} = require("./ringBuffer");

test("openRing allocates a real Float64Array of the requested capacity", () => {
  const ring = openRing(8);
  assert.ok(ring.values instanceof Float64Array);
  assert.equal(ring.values.length, 8);
  assert.equal(ring.timestamps.length, 8);
  assert.equal(ring.writeIndex, 0);
  assert.equal(ring.count, 0);
});

test("ringPush writes value/timestamp pairs and advances writeIndex", () => {
  const ring = openRing(4);
  ringPush(ring, 34.5, "t0");
  ringPush(ring, 34.8, "t1");
  assert.equal(ring.values[0], 34.5);
  assert.equal(ring.timestamps[0], "t0");
  assert.equal(ring.values[1], 34.8);
  assert.equal(ring.writeIndex, 2);
  assert.equal(ring.count, 2);
});

test("ringPush wraps the write index via modulo once capacity is exceeded", () => {
  const ring = openRing(3);
  ringPush(ring, 1, "t0");
  ringPush(ring, 2, "t1");
  ringPush(ring, 3, "t2");
  ringPush(ring, 4, "t3"); // overwrites slot 0
  assert.equal(ring.writeIndex, 1);
  assert.equal(ring.count, 3, "count saturates at capacity");
  assert.equal(ring.values[0], 4, "slot 0 was overwritten by the 4th write");
});

test("ringToOrderedReadings returns oldest-first order before the ring has wrapped", () => {
  const ring = openRing(5);
  ringPush(ring, 10, "t0");
  ringPush(ring, 20, "t1");
  ringPush(ring, 30, "t2");
  const readings = ringToOrderedReadings(ring);
  assert.deepEqual(readings.map((r) => r.value), [10, 20, 30]);
  assert.deepEqual(readings.map((r) => r.ts), ["t0", "t1", "t2"]);
});

test("ringToOrderedReadings stays oldest-first after wraparound, so latest = last-in-order", () => {
  const ring = openRing(3);
  ringPush(ring, 1, "t0");
  ringPush(ring, 2, "t1");
  ringPush(ring, 3, "t2");
  ringPush(ring, 4, "t3"); // wraps: oldest remaining is value 2 (t1)
  const readings = ringToOrderedReadings(ring);
  assert.deepEqual(readings.map((r) => r.value), [2, 3, 4]);
  assert.equal(readings[readings.length - 1].value, 4, "latest must be last-in-order, not max value");
});

test("keyOf/splitKey round-trip sensor_type and site_id", () => {
  const key = keyOf("hive_weight_kg", "apiary-a");
  assert.equal(key, "hive_weight_kg::apiary-a");
  assert.deepEqual(splitKey(key), { sensorType: "hive_weight_kg", siteId: "apiary-a" });
});

test("submit lazily opens one ring per (sensor_type, site_id) key", () => {
  const station = createStation(10);
  submit(station, "hive_weight_kg", "apiary-a", "kg", [{ ts: "t0", value: 35 }]);
  submit(station, "hive_weight_kg", "apiary-b", "kg", [{ ts: "t0", value: 40 }]);
  assert.equal(station.rings.size, 2);
  assert.equal(station.units.get("hive_weight_kg"), "kg");
});

test("snapshotAndClear groups non-empty rings and resets them for the next window", () => {
  const station = createStation(10);
  submit(station, "internal_hive_temp_c", "apiary-a", "C", [{ ts: "t0", value: 34 }, { ts: "t1", value: 34.5 }]);
  submit(station, "internal_hive_temp_c", "apiary-b", "C", [{ ts: "t0", value: 33 }]);

  const groups = snapshotAndClear(station);
  assert.equal(groups.length, 2);
  const a = groups.find((g) => g.siteId === "apiary-a");
  assert.equal(a.readings.length, 2);
  assert.equal(a.unit, "C");

  const ringA = station.rings.get(keyOf("internal_hive_temp_c", "apiary-a"));
  assert.equal(ringA.count, 0, "ring must be reset after snapshotAndClear");
  assert.equal(ringA.writeIndex, 0);
});

test("snapshotAndClear skips rings with count 0", () => {
  const station = createStation(10);
  station.rings.set(keyOf("hive_weight_kg", "apiary-a"), openRing(10));
  const groups = snapshotAndClear(station);
  assert.equal(groups.length, 0);
});

test("a ring surviving a full wraparound still reports every configured slot in RING_CAPACITY", () => {
  const station = createStation(RING_CAPACITY);
  const readings = [];
  for (let i = 0; i < RING_CAPACITY + 10; i++) readings.push({ ts: `t${i}`, value: i });
  submit(station, "acoustic_buzz_frequency_hz", "apiary-a", "Hz", readings);
  const groups = snapshotAndClear(station);
  assert.equal(groups[0].readings.length, RING_CAPACITY, "capacity caps the readings retained, oldest dropped");
  assert.equal(groups[0].readings[groups[0].readings.length - 1].value, RING_CAPACITY + 9);
});
