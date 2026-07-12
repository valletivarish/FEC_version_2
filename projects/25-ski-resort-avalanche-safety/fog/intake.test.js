"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStation, keyOf, splitKey, addReading, snapshotAndClear } = require("./intake");

test("createStation returns a plain object literal container, not a Map or array", () => {
  const station = createStation();
  assert.equal(Object.prototype.toString.call(station.groups), "[object Object]");
  assert.ok(!(station.groups instanceof Map));
  assert.ok(!Array.isArray(station.groups));
  assert.deepEqual(station.groups, {});
});

test("keyOf/splitKey round-trip sensor_type and site_id", () => {
  const key = keyOf("wind_speed_kmh", "slope-b");
  assert.equal(key, "wind_speed_kmh::slope-b");
  assert.deepEqual(splitKey(key), { sensorType: "wind_speed_kmh", siteId: "slope-b" });
});

test("addReading groups directly into the object literal at ingest time, keyed by sensor_type::site_id", () => {
  const station = createStation();
  addReading(station, "snowpack_depth_cm", "slope-a", "cm", { ts: "t0", value: 120 });
  addReading(station, "snowpack_depth_cm", "slope-a", "cm", { ts: "t1", value: 118 });
  assert.ok(Object.prototype.hasOwnProperty.call(station.groups, "snowpack_depth_cm::slope-a"));
  assert.equal(station.groups["snowpack_depth_cm::slope-a"].length, 2);
});

test("addReading keeps two site_ids of the same sensor_type in separate object keys", () => {
  const station = createStation();
  addReading(station, "wind_speed_kmh", "slope-a", "km/h", { ts: "t0", value: 25 });
  addReading(station, "wind_speed_kmh", "slope-b", "km/h", { ts: "t0", value: 30 });
  assert.equal(Object.keys(station.groups).length, 2);
});

test("snapshotAndClear returns one group per key and resets station.groups to a fresh {}", () => {
  const station = createStation();
  addReading(station, "seismic_vibration_mg", "slope-a", "milli-g", { ts: "t0", value: 3 });
  addReading(station, "seismic_vibration_mg", "slope-b", "milli-g", { ts: "t0", value: 4 });

  const groups = snapshotAndClear(station);
  assert.equal(groups.length, 2);
  assert.deepEqual(station.groups, {});
});

test("readings that arrive after a snapshot start a fresh group, not the drained one", () => {
  const station = createStation();
  addReading(station, "snow_temp_c", "slope-a", "C", { ts: "t0", value: -8 });
  const firstWindow = snapshotAndClear(station);
  addReading(station, "snow_temp_c", "slope-a", "C", { ts: "t1", value: -7.5 });

  assert.equal(firstWindow.length, 1);
  assert.equal(station.groups["snow_temp_c::slope-a"].length, 1);
  assert.equal(station.groups["snow_temp_c::slope-a"][0].value, -7.5);
});

test("snapshotAndClear carries the unit through to each group", () => {
  const station = createStation();
  addReading(station, "lift_chair_count", "slope-b", "count", { ts: "t0", value: 30 });
  const groups = snapshotAndClear(station);
  assert.equal(groups[0].unit, "count");
  assert.equal(groups[0].sensorType, "lift_chair_count");
  assert.equal(groups[0].siteId, "slope-b");
});

test("an empty station yields no groups on snapshot", () => {
  const station = createStation();
  assert.deepEqual(snapshotAndClear(station), []);
});
