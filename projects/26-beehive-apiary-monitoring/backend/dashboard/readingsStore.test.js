"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SENSOR_TYPES, latestWindowsFor, buildApiarySummaries, getApiarySummary, freshestAgeSeconds } = require("./readingsStore");

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
  const doc = fakeDoc({ hive_weight_kg: [{ sensor_type: "hive_weight_kg", site_id: "apiary-a", avg: 35.0 }, { sensor_type: "hive_weight_kg", site_id: "apiary-a", avg: 35.5 }] });
  const items = await latestWindowsFor(doc, "bam-readings", "hive_weight_kg", 10);
  assert.equal(items.length, 2);
  assert.equal(items[0].avg, 35.0);
});

test("buildApiarySummaries groups the latest window per sensor type into each apiary", async () => {
  const doc = fakeDoc({
    hive_weight_kg: [
      { sensor_type: "hive_weight_kg", site_id: "apiary-a", unit: "kg", latest: 35.0, min: 34.0, max: 36.0, avg: 35.0, window_end: "e1", alerts: [] },
      { sensor_type: "hive_weight_kg", site_id: "apiary-b", unit: "kg", latest: 18.0, min: 17.0, max: 19.0, avg: 18.0, window_end: "e1", alerts: ["colony_starvation_risk"] },
    ],
    internal_hive_temp_c: [], internal_humidity_pct: [], acoustic_buzz_frequency_hz: [], entrance_traffic_count: [],
  });

  const apiaries = await buildApiarySummaries(doc, "bam-readings");
  assert.equal(apiaries.length, 2);
  const a = apiaries.find((p) => p.site_id === "apiary-a");
  const b = apiaries.find((p) => p.site_id === "apiary-b");
  assert.equal(a.metrics.hive_weight_kg.latest, 35.0);
  assert.equal(a.compliant, true);
  assert.equal(b.compliant, false, "apiary-b has an active colony_starvation_risk");
  assert.deepEqual(b.alerts, [{ sensor_type: "hive_weight_kg", key: "colony_starvation_risk" }]);
});

test("buildApiarySummaries attaches a colony health narrative sentence to every apiary", async () => {
  const doc = fakeDoc({
    hive_weight_kg: [
      { sensor_type: "hive_weight_kg", site_id: "apiary-a", unit: "kg", latest: 36.0, min: 34.0, max: 36.0, avg: 34.0, window_end: "e1", alerts: [] },
      { sensor_type: "hive_weight_kg", site_id: "apiary-a", unit: "kg", latest: 36.0, min: 34.0, max: 36.0, avg: 36.0, window_end: "e2", alerts: [] },
    ],
    internal_hive_temp_c: [
      { sensor_type: "internal_hive_temp_c", site_id: "apiary-a", unit: "C", latest: 34.0, min: 33.5, max: 34.5, avg: 34.0, window_end: "e2", alerts: [] },
    ],
    internal_humidity_pct: [], acoustic_buzz_frequency_hz: [], entrance_traffic_count: [],
  });

  const apiaries = await buildApiarySummaries(doc, "bam-readings");
  const a = apiaries.find((p) => p.site_id === "apiary-a");
  assert.equal(a.health.trend, "rising");
  assert.equal(a.health.stability, "stable");
  assert.match(a.health.sentence, /^apiary-a:/);
});

test("buildApiarySummaries returns both apiaries even with no data yet, sorted by site_id", async () => {
  const doc = fakeDoc({});
  const apiaries = await buildApiarySummaries(doc, "bam-readings");
  assert.deepEqual(apiaries.map((p) => p.site_id), ["apiary-a", "apiary-b"]);
  assert.deepEqual(apiaries[0].metrics, {});
  assert.equal(apiaries[0].compliant, true);
  assert.equal(apiaries[0].health.trend, "steady");
});

test("getApiarySummary returns a single apiary by site_id, or null when unknown", async () => {
  const doc = fakeDoc({});
  const apiary = await getApiarySummary(doc, "bam-readings", "apiary-a");
  assert.equal(apiary.site_id, "apiary-a");
  assert.equal(await getApiarySummary(doc, "bam-readings", "apiary-z"), null);
});

test("freshestAgeSeconds returns null when the table is entirely empty", async () => {
  const doc = fakeDoc({});
  assert.equal(await freshestAgeSeconds(doc, "bam-readings"), null);
});

test("freshestAgeSeconds returns the smallest age across all sensor types", async () => {
  const now = Date.now();
  const recentEnd = new Date(now - 2000).toISOString();
  const staleEnd = new Date(now - 50_000).toISOString();
  const doc = fakeDoc({
    hive_weight_kg: [{ sensor_type: "hive_weight_kg", site_id: "apiary-a", window_end: staleEnd }],
    internal_hive_temp_c: [{ sensor_type: "internal_hive_temp_c", site_id: "apiary-a", window_end: recentEnd }],
  });
  const age = await freshestAgeSeconds(doc, "bam-readings");
  assert.ok(age !== null && age < 5, `expected the freshest age to reflect the recent window, got ${age}`);
});

test("SENSOR_TYPES lists all five beehive sensors", () => {
  assert.deepEqual(SENSOR_TYPES, [
    "hive_weight_kg",
    "internal_hive_temp_c",
    "internal_humidity_pct",
    "acoustic_buzz_frequency_hz",
    "entrance_traffic_count",
  ]);
});
