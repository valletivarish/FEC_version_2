"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStation, buffer, snapshotAndClear } = require("./ingestRouter");

test("buffer folds readings into a per sensor/site accumulator", () => {
  const station = createStation();
  const accepted = buffer(station, {
    sensor_type: "wind_speed_ms",
    site_id: "turbine-1",
    unit: "m/s",
    readings: [{ ts: "t0", value: 8 }, { ts: "t1", value: 12 }],
  });
  assert.equal(accepted, 2);
  assert.equal(station.buckets.get("wind_speed_ms::turbine-1").count, 2);
});

test("snapshotAndClear only returns non-empty groups and resets the station", () => {
  const station = createStation();
  buffer(station, { sensor_type: "power_output_kw", site_id: "turbine-2", unit: "kW", readings: [{ ts: "t0", value: 900 }] });
  const groups = snapshotAndClear(station);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sensorType, "power_output_kw");
  assert.equal(groups[0].siteId, "turbine-2");
  assert.equal(groups[0].unit, "kW");
  assert.equal(station.buckets.size, 0);
});

test("two sites of the same sensor type stay in separate buckets", () => {
  const station = createStation();
  buffer(station, { sensor_type: "generator_temp_c", site_id: "turbine-1", unit: "C", readings: [{ ts: "t0", value: 60 }] });
  buffer(station, { sensor_type: "generator_temp_c", site_id: "turbine-2", unit: "C", readings: [{ ts: "t0", value: 70 }] });
  const groups = snapshotAndClear(station);
  const bySite = Object.fromEntries(groups.map((g) => [g.siteId, g.acc.latest]));
  assert.equal(bySite["turbine-1"], 60);
  assert.equal(bySite["turbine-2"], 70);
});

test("snapshotAndClear skips buckets that received no readings", () => {
  const station = createStation();
  buffer(station, { sensor_type: "wind_speed_ms", site_id: "turbine-1", unit: "m/s", readings: [] });
  assert.equal(snapshotAndClear(station).length, 0);
});
