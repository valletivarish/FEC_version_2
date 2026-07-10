"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createStation,
  openRing,
  ringPush,
  ringToOrderedArray,
  submit,
  snapshotAndClear,
  keyOf,
  splitKey,
} = require("./ringBuffer");

test("keyOf/splitKey round-trip a (sensor_type, site_id) pair", () => {
  const key = keyOf("temperature_c", "hall-1");
  assert.deepEqual(splitKey(key), { sensorType: "temperature_c", siteId: "hall-1" });
});

test("ringPush writes at writeIndex then advances it, without wrapping below capacity", () => {
  const ring = openRing(4);
  ringPush(ring, "a");
  ringPush(ring, "b");
  assert.equal(ring.writeIndex, 2);
  assert.equal(ring.count, 2);
  assert.deepEqual(ring.slots, ["a", "b", null, null]);
});

test("ringPush wraps the write-index via modulo once capacity is exceeded", () => {
  const ring = openRing(3);
  ringPush(ring, 1);
  ringPush(ring, 2);
  ringPush(ring, 3);
  assert.equal(ring.writeIndex, 0, "write-index should wrap back to 0 after filling capacity");
  ringPush(ring, 4);
  assert.equal(ring.writeIndex, 1);
  assert.equal(ring.count, 3, "count saturates at capacity, it does not keep growing");
  assert.deepEqual(ring.slots, [4, 2, 3], "slot 0 was overwritten by the 4th write");
});

test("ringToOrderedArray returns oldest-first order before the ring has wrapped", () => {
  const ring = openRing(5);
  ringPush(ring, "x");
  ringPush(ring, "y");
  assert.deepEqual(ringToOrderedArray(ring), ["x", "y"]);
});

test("ringToOrderedArray still returns oldest-first order after wrapping", () => {
  const ring = openRing(3);
  [1, 2, 3, 4, 5].forEach((v) => ringPush(ring, v));
  // writes: 1,2,3 fill the ring; 4 overwrites slot0; 5 overwrites slot1
  // remaining physical order: [4,5,3] with writeIndex at 2 -> logical oldest-first is [3,4,5]
  assert.deepEqual(ringToOrderedArray(ring), [3, 4, 5]);
});

test("submit opens a ring lazily per (sensor_type, site_id) key and records the unit", () => {
  const station = createStation(8);
  submit(station, "humidity_pct", "hall-1", "%", [{ ts: "t0", value: 45.1 }]);
  const ring = station.rings.get(keyOf("humidity_pct", "hall-1"));
  assert.ok(ring, "a ring should have been created for the new key");
  assert.equal(ring.count, 1);
  assert.equal(station.units.get("humidity_pct"), "%");
});

test("submit keeps separate rings for the same sensor type at different sites", () => {
  const station = createStation(8);
  submit(station, "power_load_kw", "hall-1", "kW", [{ ts: "t0", value: 60 }]);
  submit(station, "power_load_kw", "hall-2", "kW", [{ ts: "t0", value: 62 }]);
  assert.equal(station.rings.size, 2);
});

test("snapshotAndClear returns one group per non-empty ring, then resets every ring", () => {
  const station = createStation(8);
  submit(station, "temperature_c", "hall-1", "C", [{ ts: "t0", value: 22 }, { ts: "t1", value: 23 }]);
  const groups = snapshotAndClear(station);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sensorType, "temperature_c");
  assert.equal(groups[0].siteId, "hall-1");
  assert.equal(groups[0].unit, "C");
  assert.deepEqual(groups[0].readings, [{ ts: "t0", value: 22 }, { ts: "t1", value: 23 }]);

  const ring = station.rings.get(keyOf("temperature_c", "hall-1"));
  assert.equal(ring.count, 0, "ring should be reset (count back to 0) after flush");
  assert.equal(ring.writeIndex, 0, "write-index should be reset to 0 after flush");
  assert.deepEqual(snapshotAndClear(station), [], "a second flush with no new writes returns no groups");
});

test("snapshotAndClear skips keys with an empty ring and never crashes on an empty station", () => {
  const station = createStation(8);
  assert.deepEqual(snapshotAndClear(station), []);
});

test("a ring buffer that wraps mid-window still surfaces the correct, bounded reading count at flush", () => {
  const station = createStation(4);
  const readings = [1, 2, 3, 4, 5, 6].map((v, i) => ({ ts: `t${i}`, value: v }));
  submit(station, "dust_density_ugm3", "hall-2", "ug/m3", readings);
  const [group] = snapshotAndClear(station);
  assert.equal(group.readings.length, 4, "only the last RING_CAPACITY readings survive a wraparound");
  assert.deepEqual(group.readings.map((r) => r.value), [3, 4, 5, 6]);
});
