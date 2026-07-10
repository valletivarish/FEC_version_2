"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStation, keyOf, splitKey } = require("./buffer");

test("keyOf/splitKey round-trip sensorType and siteId", () => {
  const key = keyOf("temperature_c", "station-1");
  assert.deepEqual(splitKey(key), { sensorType: "temperature_c", siteId: "station-1" });
});

test("submit emits a reading event that the station listener buffers", () => {
  const station = createStation();
  station.submit("temperature_c", "station-1", "C", [{ ts: "t0", value: 22 }, { ts: "t1", value: 23 }]);
  const groups = station.snapshotAndClear();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sensorType, "temperature_c");
  assert.equal(groups[0].siteId, "station-1");
  assert.equal(groups[0].unit, "C");
  assert.equal(groups[0].readings.length, 2);
});

test("two sites of the same sensor type stay in separate buckets", () => {
  const station = createStation();
  station.submit("smoke_density_ppm", "station-1", "ppm", [{ ts: "t0", value: 10 }]);
  station.submit("smoke_density_ppm", "station-2", "ppm", [{ ts: "t0", value: 200 }]);
  const groups = station.snapshotAndClear();
  assert.equal(groups.length, 2);
  const bySite = Object.fromEntries(groups.map((g) => [g.siteId, g.readings[0].value]));
  assert.equal(bySite["station-1"], 10);
  assert.equal(bySite["station-2"], 200);
});

test("snapshotAndClear resets the buffer and skips empty groups", () => {
  const station = createStation();
  station.submit("wind_speed_kmh", "station-1", "km/h", [{ ts: "t0", value: 15 }]);
  const first = station.snapshotAndClear();
  assert.equal(first.length, 1);
  const second = station.snapshotAndClear();
  assert.equal(second.length, 0, "buffer should be empty after being drained");
});

test("emitter is a real EventEmitter driving the buffering, not called directly", () => {
  const station = createStation();
  let observed = null;
  station.emitter.on("reading", (payload) => { observed = payload; });
  station.submit("soil_moisture_pct", "station-1", "%", [{ ts: "t0", value: 25 }]);
  assert.equal(observed.sensorType, "soil_moisture_pct");
  assert.equal(observed.values.length, 1);
});
