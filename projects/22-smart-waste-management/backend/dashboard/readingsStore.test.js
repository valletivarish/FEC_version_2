"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SENSOR_TYPES,
  SITE_IDS,
  buildDistrictSummaries,
  getDistrictSummary,
  buildPriorityList,
  freshestAgeSeconds,
} = require("./readingsStore");

function fakeDoc(itemsBySensorType) {
  return {
    send: async (command) => {
      const sensorType = command.input.ExpressionAttributeValues[":st"];
      return { Items: itemsBySensorType[sensorType] || [] };
    },
  };
}

test("SENSOR_TYPES has exactly the 5 required sensor types", () => {
  assert.deepEqual(SENSOR_TYPES.sort(), ["bin_weight_kg", "fill_level_pct", "gas_level_ppm", "internal_temp_c", "lid_open_count"].sort());
});

test("SITE_IDS is the two collection districts", () => {
  assert.deepEqual(SITE_IDS, ["district-a", "district-b"]);
});

test("buildDistrictSummaries always returns both districts even with no data", async () => {
  const doc = fakeDoc({});
  const districts = await buildDistrictSummaries(doc, "swm-readings");
  assert.equal(districts.length, 2);
  assert.deepEqual(districts.map((d) => d.site_id), ["district-a", "district-b"]);
  assert.ok(districts.every((d) => d.compliant));
});

test("buildDistrictSummaries attaches per-sensor metrics and marks non-compliant when alerts fire", async () => {
  const doc = fakeDoc({
    fill_level_pct: [{ site_id: "district-a", latest: 90, min: 80, max: 90, avg: 88, unit: "%", window_end: "e1", alerts: ["collection_needed"] }],
    gas_level_ppm: [{ site_id: "district-a", latest: 50, min: 40, max: 50, avg: 45, unit: "ppm", window_end: "e1", alerts: [] }],
  });
  const districts = await buildDistrictSummaries(doc, "swm-readings");
  const districtA = districts.find((d) => d.site_id === "district-a");
  assert.equal(districtA.metrics.fill_level_pct.latest, 90);
  assert.equal(districtA.compliant, false);
  assert.deepEqual(districtA.alerts, [{ sensor_type: "fill_level_pct", key: "collection_needed" }]);

  const districtB = districts.find((d) => d.site_id === "district-b");
  assert.equal(districtB.compliant, true);
});

test("getDistrictSummary returns null for an unknown site id", async () => {
  const doc = fakeDoc({});
  const result = await getDistrictSummary(doc, "swm-readings", "district-z");
  assert.equal(result, null);
});

test("getDistrictSummary returns the matching district", async () => {
  const doc = fakeDoc({
    fill_level_pct: [{ site_id: "district-b", latest: 40, min: 30, max: 40, avg: 35, unit: "%", window_end: "e1", alerts: [] }],
  });
  const result = await getDistrictSummary(doc, "swm-readings", "district-b");
  assert.equal(result.site_id, "district-b");
  assert.equal(result.metrics.fill_level_pct.latest, 40);
});

test("buildPriorityList sorts descending by fill_level_pct.latest, most urgent first", () => {
  const districts = [
    { site_id: "district-a", metrics: { fill_level_pct: { latest: 40 } }, alerts: [], compliant: true },
    { site_id: "district-b", metrics: { fill_level_pct: { latest: 92 } }, alerts: [{ sensor_type: "fill_level_pct", key: "collection_needed" }], compliant: false },
  ];
  const list = buildPriorityList(districts);
  assert.equal(list[0].site_id, "district-b");
  assert.equal(list[1].site_id, "district-a");
});

test("buildPriorityList pushes districts with no fill_level_pct data to the end", () => {
  const districts = [
    { site_id: "district-a", metrics: {}, alerts: [], compliant: true },
    { site_id: "district-b", metrics: { fill_level_pct: { latest: 10 } }, alerts: [], compliant: true },
  ];
  const list = buildPriorityList(districts);
  assert.equal(list[0].site_id, "district-b");
  assert.equal(list[1].site_id, "district-a");
  assert.equal(list[1].fill_level_pct, null);
});

test("freshestAgeSeconds returns null when no data exists at all", async () => {
  const doc = fakeDoc({});
  const age = await freshestAgeSeconds(doc, "swm-readings");
  assert.equal(age, null);
});

test("freshestAgeSeconds returns the smallest age across sensor types", async () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 2000).toISOString();
  const old = new Date(now.getTime() - 60000).toISOString();
  const doc = fakeDoc({
    fill_level_pct: [{ site_id: "district-a", window_end: old }],
    gas_level_ppm: [{ site_id: "district-a", window_end: recent }],
  });
  const age = await freshestAgeSeconds(doc, "swm-readings");
  assert.ok(age < 5, `expected freshest age near 2s, got ${age}`);
});
