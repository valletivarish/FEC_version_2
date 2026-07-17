"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openReadingBuffer, bufferReading, flushBuffer, clusterByPlantSensor } = require("./ledger");

test("bufferReading is a plain synchronous array push, no per-key structure", () => {
  const ledger = openReadingBuffer();
  bufferReading(ledger, { sensorType: "ph_level", siteId: "plant-1", unit: "pH", ts: "t0", value: 7.1 });
  bufferReading(ledger, { sensorType: "chlorine_ppm", siteId: "plant-2", unit: "ppm", ts: "t0", value: 0.9 });
  assert.equal(ledger.entries.length, 2);
  assert.equal(ledger.entries[0].sensorType, "ph_level");
  assert.equal(ledger.entries[1].sensorType, "chlorine_ppm");
});

test("flushBuffer empties the ledger and returns entries in arrival order", () => {
  const ledger = openReadingBuffer();
  bufferReading(ledger, { sensorType: "turbidity_ntu", siteId: "plant-1", unit: "NTU", ts: "t0", value: 1 });
  bufferReading(ledger, { sensorType: "turbidity_ntu", siteId: "plant-1", unit: "NTU", ts: "t1", value: 2 });
  const taken = flushBuffer(ledger);
  assert.equal(taken.length, 2);
  assert.equal(ledger.entries.length, 0, "ledger must be empty immediately after drain");
  assert.equal(taken[0].value, 1);
  assert.equal(taken[1].value, 2);
});

test("flushBuffer returns an empty array when nothing was appended", () => {
  const ledger = openReadingBuffer();
  assert.deepEqual(flushBuffer(ledger), []);
});

test("clusterByPlantSensor aggregates entries into per (sensor_type, site_id) groups only at call time", () => {
  const entries = [
    { sensorType: "pressure_bar", siteId: "plant-1", unit: "bar", ts: "t0", value: 4.0 },
    { sensorType: "pressure_bar", siteId: "plant-2", unit: "bar", ts: "t0", value: 3.5 },
    { sensorType: "pressure_bar", siteId: "plant-1", unit: "bar", ts: "t1", value: 4.2 },
  ];
  const groups = clusterByPlantSensor(entries);
  assert.equal(groups.length, 2);
  const plant1 = groups.find((g) => g.siteId === "plant-1");
  const plant2 = groups.find((g) => g.siteId === "plant-2");
  assert.equal(plant1.readings.length, 2);
  assert.equal(plant2.readings.length, 1);
  assert.equal(plant1.unit, "bar");
});

test("clusterByPlantSensor keeps two site_ids of the same sensor_type in separate groups", () => {
  const entries = [
    { sensorType: "flow_rate_lps", siteId: "plant-1", unit: "L/s", ts: "t0", value: 60 },
    { sensorType: "flow_rate_lps", siteId: "plant-2", unit: "L/s", ts: "t0", value: 70 },
  ];
  const groups = clusterByPlantSensor(entries);
  assert.equal(groups.length, 2);
});

test("end-to-end: append many raw readings, drain once, then group -- aggregation is deferred entirely to this point", () => {
  const ledger = openReadingBuffer();
  bufferReading(ledger, { sensorType: "ph_level", siteId: "plant-1", unit: "pH", ts: "t0", value: 7.0 });
  bufferReading(ledger, { sensorType: "ph_level", siteId: "plant-1", unit: "pH", ts: "t1", value: 7.2 });
  bufferReading(ledger, { sensorType: "chlorine_ppm", siteId: "plant-1", unit: "ppm", ts: "t0", value: 0.9 });

  const groups = clusterByPlantSensor(flushBuffer(ledger));
  assert.equal(groups.length, 2);
  assert.equal(ledger.entries.length, 0);
});
