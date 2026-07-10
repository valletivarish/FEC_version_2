"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SENSOR_TYPES, latestWindowsFor, buildPlantSummaries, getPlantSummary, freshestAgeSeconds } = require("./readingsStore");

function fakeDoc(itemsBySensorType) {
  return {
    send: async (command) => {
      const sensorType = command.input.ExpressionAttributeValues[":st"];
      const items = itemsBySensorType[sensorType] || [];
      return { Items: items.slice().reverse() };
    },
  };
}

test("latestWindowsFor queries by sensor_type and returns items in chronological order", async () => {
  const doc = fakeDoc({ ph_level: [{ sensor_type: "ph_level", site_id: "plant-1", avg: 7.0 }, { sensor_type: "ph_level", site_id: "plant-1", avg: 7.1 }] });
  const items = await latestWindowsFor(doc, "wtu-readings", "ph_level", 10);
  assert.equal(items.length, 2);
  assert.equal(items[0].avg, 7.0);
});

test("buildPlantSummaries groups the latest window per sensor type into each plant", async () => {
  const doc = fakeDoc({
    turbidity_ntu: [
      { sensor_type: "turbidity_ntu", site_id: "plant-1", unit: "NTU", latest: 2.0, min: 1.0, max: 3.0, avg: 2.0, window_end: "e1", alerts: [] },
      { sensor_type: "turbidity_ntu", site_id: "plant-2", unit: "NTU", latest: 6.0, min: 5.0, max: 7.0, avg: 6.0, window_end: "e1", alerts: ["turbidity_alert"] },
    ],
    ph_level: [], chlorine_ppm: [], flow_rate_lps: [], pressure_bar: [],
  });

  const plants = await buildPlantSummaries(doc, "wtu-readings");
  assert.equal(plants.length, 2);
  const p1 = plants.find((p) => p.site_id === "plant-1");
  const p2 = plants.find((p) => p.site_id === "plant-2");
  assert.equal(p1.metrics.turbidity_ntu.latest, 2.0);
  assert.equal(p1.compliant, true);
  assert.equal(p2.compliant, false, "plant-2 has an active turbidity_alert");
  assert.deepEqual(p2.alerts, [{ sensor_type: "turbidity_ntu", key: "turbidity_alert" }]);
});

test("buildPlantSummaries returns both plants even with no data yet, sorted by site_id", async () => {
  const doc = fakeDoc({});
  const plants = await buildPlantSummaries(doc, "wtu-readings");
  assert.deepEqual(plants.map((p) => p.site_id), ["plant-1", "plant-2"]);
  assert.deepEqual(plants[0].metrics, {});
  assert.equal(plants[0].compliant, true);
});

test("getPlantSummary returns a single plant by site_id, or null when unknown", async () => {
  const doc = fakeDoc({});
  const plant = await getPlantSummary(doc, "wtu-readings", "plant-1");
  assert.equal(plant.site_id, "plant-1");
  assert.equal(await getPlantSummary(doc, "wtu-readings", "plant-9"), null);
});

test("freshestAgeSeconds returns null when the table is entirely empty", async () => {
  const doc = fakeDoc({});
  assert.equal(await freshestAgeSeconds(doc, "wtu-readings"), null);
});

test("freshestAgeSeconds returns the smallest age across all sensor types", async () => {
  const now = Date.now();
  const recentEnd = new Date(now - 2000).toISOString();
  const staleEnd = new Date(now - 50_000).toISOString();
  const doc = fakeDoc({
    turbidity_ntu: [{ sensor_type: "turbidity_ntu", site_id: "plant-1", window_end: staleEnd }],
    ph_level: [{ sensor_type: "ph_level", site_id: "plant-1", window_end: recentEnd }],
  });
  const age = await freshestAgeSeconds(doc, "wtu-readings");
  assert.ok(age !== null && age < 5, `expected the freshest age to reflect the recent window, got ${age}`);
});

test("SENSOR_TYPES lists all five water-treatment sensors", () => {
  assert.deepEqual(SENSOR_TYPES, ["turbidity_ntu", "ph_level", "chlorine_ppm", "flow_rate_lps", "pressure_bar"]);
});
