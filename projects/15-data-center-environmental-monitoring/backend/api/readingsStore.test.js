"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { latestWindowsFor, buildHallSummaries, getHallSummary, freshestAgeSeconds, SENSOR_TYPES } = require("./readingsStore");

function fakeDoc(itemsBySensorType) {
  return {
    send: async (command) => {
      const sensorType = command.input.ExpressionAttributeValues[":st"];
      const items = itemsBySensorType[sensorType] || [];
      // real DynamoDB QueryCommand with ScanIndexForward:false returns
      // newest-first; latestWindowsFor reverses that back to oldest-first.
      return { Items: items.slice().reverse().slice(0, command.input.Limit) };
    },
  };
}

function windowItem(sensorType, siteId, windowEnd, avg, alerts = []) {
  return { sensor_type: sensorType, site_id: siteId, window_end: windowEnd, avg, min: avg, max: avg, latest: avg, unit: "x", alerts };
}

test("latestWindowsFor returns items in oldest-first order", async () => {
  const doc = fakeDoc({
    temperature_c: [
      windowItem("temperature_c", "hall-1", "e1", 21),
      windowItem("temperature_c", "hall-1", "e2", 22),
    ],
  });
  const items = await latestWindowsFor(doc, "dce-readings", "temperature_c", 10);
  assert.deepEqual(items.map((i) => i.window_end), ["e1", "e2"]);
});

test("buildHallSummaries groups the latest window per sensor type into both halls", async () => {
  const doc = fakeDoc({
    temperature_c: [windowItem("temperature_c", "hall-1", "e1", 22), windowItem("temperature_c", "hall-2", "e1", 24)],
    humidity_pct: [windowItem("humidity_pct", "hall-1", "e1", 45)],
    airflow_cfm: [],
    power_load_kw: [],
    dust_density_ugm3: [],
  });
  const halls = await buildHallSummaries(doc, "dce-readings");
  assert.equal(halls.length, 2);
  const hall1 = halls.find((h) => h.site_id === "hall-1");
  assert.equal(hall1.metrics.temperature_c.latest, 22);
  assert.equal(hall1.metrics.humidity_pct.latest, 45);
  assert.equal(hall1.nominal, true);
});

test("buildHallSummaries sets nominal=false and records alerts when a hall has an active alert", async () => {
  const byType = Object.fromEntries(SENSOR_TYPES.map((t) => [t, []]));
  byType.power_load_kw = [windowItem("power_load_kw", "hall-2", "e1", 140, ["capacity_warning"])];
  const doc = fakeDoc(byType);
  const halls = await buildHallSummaries(doc, "dce-readings");
  const hall2 = halls.find((h) => h.site_id === "hall-2");
  assert.equal(hall2.nominal, false);
  assert.deepEqual(hall2.alerts, [{ sensor_type: "power_load_kw", key: "capacity_warning" }]);
});

test("buildHallSummaries returns halls sorted by site_id", async () => {
  const byType = Object.fromEntries(SENSOR_TYPES.map((t) => [t, []]));
  const doc = fakeDoc(byType);
  const halls = await buildHallSummaries(doc, "dce-readings");
  assert.deepEqual(halls.map((h) => h.site_id), ["hall-1", "hall-2"]);
});

test("getHallSummary returns null for an unknown hall id", async () => {
  const byType = Object.fromEntries(SENSOR_TYPES.map((t) => [t, []]));
  const doc = fakeDoc(byType);
  const hall = await getHallSummary(doc, "dce-readings", "hall-9");
  assert.equal(hall, null);
});

test("freshestAgeSeconds computes age from the most recent window_end across sensor types", async () => {
  const now = Date.now();
  const byType = Object.fromEntries(SENSOR_TYPES.map((t) => [t, []]));
  byType.temperature_c = [windowItem("temperature_c", "hall-1", new Date(now - 5000).toISOString(), 22)];
  const doc = fakeDoc(byType);
  const age = await freshestAgeSeconds(doc, "dce-readings");
  assert.ok(age >= 4 && age < 10, `expected age around 5s, got ${age}`);
});

test("freshestAgeSeconds returns null when the table has no items yet", async () => {
  const byType = Object.fromEntries(SENSOR_TYPES.map((t) => [t, []]));
  const doc = fakeDoc(byType);
  const age = await freshestAgeSeconds(doc, "dce-readings");
  assert.equal(age, null);
});
