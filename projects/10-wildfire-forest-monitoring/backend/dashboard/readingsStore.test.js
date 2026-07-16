"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { latestWindowsFor, buildStationSummaries, freshestAgeSeconds } = require("./readingsStore");

class QueryScriptedTable {
  constructor(itemsBySensorType) {
    this.itemsBySensorType = itemsBySensorType;
  }
  async send(command) {
    const sensorType = command.input.ExpressionAttributeValues[":st"];
    const all = (this.itemsBySensorType[sensorType] || []).slice().reverse();
    return { Items: all.slice(0, command.input.Limit) };
  }
}

test("latestWindowsFor returns items oldest-to-newest", async () => {
  const doc = new QueryScriptedTable({
    temperature_c: [
      { sensor_type: "temperature_c", site_id: "station-1", window_end: "t0", latest: 20 },
      { sensor_type: "temperature_c", site_id: "station-1", window_end: "t1", latest: 25 },
    ],
  });
  const items = await latestWindowsFor(doc, "table", "temperature_c", 10);
  assert.deepEqual(items.map((i) => i.window_end), ["t0", "t1"]);
});

test("buildStationSummaries produces distinct per-station metrics and a computed fire_risk_index", async () => {
  const doc = new QueryScriptedTable({
    temperature_c: [
      { sensor_type: "temperature_c", site_id: "station-1", window_end: "t0", latest: 20, min: 18, max: 22, avg: 20, unit: "C", alerts: [] },
      { sensor_type: "temperature_c", site_id: "station-2", window_end: "t0", latest: 44, min: 40, max: 46, avg: 44, unit: "C", alerts: ["extreme_heat"] },
    ],
    humidity_pct: [],
    smoke_density_ppm: [
      { sensor_type: "smoke_density_ppm", site_id: "station-2", window_end: "t0", latest: 200, min: 150, max: 220, avg: 200, unit: "ppm", alerts: ["fire_detected"] },
    ],
    wind_speed_kmh: [],
    soil_moisture_pct: [],
  });
  const stations = await buildStationSummaries(doc, "table");
  assert.equal(stations.length, 2);
  const s1 = stations.find((s) => s.site_id === "station-1");
  const s2 = stations.find((s) => s.site_id === "station-2");

  assert.equal(s1.metrics.temperature_c.latest, 20);
  assert.equal(s2.metrics.temperature_c.latest, 44);
  assert.notDeepEqual(s1.metrics, s2.metrics);

  // station-1: nothing crosses a risk-contribution threshold
  assert.equal(s1.fire_risk_index, 0);
  // station-2: temperature avg 44 > 30 (+1), smoke avg 200 > 60 (+1) = 2
  assert.equal(s2.fire_risk_index, 2);
  assert.ok(Number.isInteger(s2.fire_risk_index));
  assert.ok(s2.fire_risk_index >= 0 && s2.fire_risk_index <= 4);

  assert.deepEqual(s2.alerts, [
    { sensor_type: "temperature_c", key: "extreme_heat" },
    { sensor_type: "smoke_density_ppm", key: "fire_detected" },
  ]);
  assert.deepEqual(s1.alerts, []);
});

test("buildStationSummaries seeds both known stations even with no data at all", async () => {
  const doc = new QueryScriptedTable({});
  const stations = await buildStationSummaries(doc, "table");
  assert.deepEqual(stations.map((s) => s.site_id), ["station-1", "station-2"]);
  assert.equal(stations[0].fire_risk_index, 0);
});

test("freshestAgeSeconds returns null when the table is empty", async () => {
  const doc = new QueryScriptedTable({});
  assert.equal(await freshestAgeSeconds(doc, "table"), null);
});

test("freshestAgeSeconds returns the smallest age across sensor types", async () => {
  const recent = new Date(Date.now() - 2000).toISOString();
  const stale = new Date(Date.now() - 500000).toISOString();
  const doc = new QueryScriptedTable({
    temperature_c: [{ sensor_type: "temperature_c", site_id: "station-1", window_end: stale }],
    humidity_pct: [{ sensor_type: "humidity_pct", site_id: "station-1", window_end: recent }],
  });
  const age = await freshestAgeSeconds(doc, "table");
  assert.ok(age < 10);
});
