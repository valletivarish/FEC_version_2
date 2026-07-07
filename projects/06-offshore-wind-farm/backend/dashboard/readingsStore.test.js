"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { latestWindowsFor, buildFarmGrid, freshestAgeSeconds } = require("./readingsStore");

class FakeDoc {
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
  const doc = new FakeDoc({
    wind_speed_ms: [
      { sensor_type: "wind_speed_ms", site_id: "turbine-1", window_end: "t0", latest: 8 },
      { sensor_type: "wind_speed_ms", site_id: "turbine-1", window_end: "t1", latest: 12 },
    ],
  });
  const items = await latestWindowsFor(doc, "table", "wind_speed_ms", 10);
  assert.deepEqual(items.map((i) => i.window_end), ["t0", "t1"]);
});

test("buildFarmGrid produces one tile per turbine with per-metric readings", async () => {
  const doc = new FakeDoc({
    wind_speed_ms: [
      { sensor_type: "wind_speed_ms", site_id: "turbine-1", window_end: "t0", latest: 14, min: 10, max: 18, avg: 14, unit: "m/s", alerts: [] },
      { sensor_type: "wind_speed_ms", site_id: "turbine-2", window_end: "t0", latest: 28, min: 20, max: 30, avg: 28, unit: "m/s", alerts: ["high_wind_shutdown_risk"] },
    ],
    blade_vibration_mm: [],
    generator_temp_c: [],
    power_output_kw: [],
    gearbox_pressure_bar: [],
  });
  const tiles = await buildFarmGrid(doc, "table");
  assert.equal(tiles.length, 2);
  const t1 = tiles.find((t) => t.site_id === "turbine-1");
  const t2 = tiles.find((t) => t.site_id === "turbine-2");
  assert.equal(t1.metrics.wind_speed_ms.latest, 14);
  assert.equal(t2.metrics.wind_speed_ms.latest, 28);
  assert.notDeepEqual(t1.metrics.wind_speed_ms, t2.metrics.wind_speed_ms);
  assert.deepEqual(t2.alerts, [{ sensor_type: "wind_speed_ms", key: "high_wind_shutdown_risk" }]);
  assert.deepEqual(t1.alerts, []);
});

test("buildFarmGrid seeds both known turbines even with no data at all", async () => {
  const doc = new FakeDoc({});
  const tiles = await buildFarmGrid(doc, "table");
  assert.deepEqual(tiles.map((t) => t.site_id), ["turbine-1", "turbine-2"]);
});

test("freshestAgeSeconds returns null when the table is empty", async () => {
  const doc = new FakeDoc({});
  assert.equal(await freshestAgeSeconds(doc, "table"), null);
});

test("freshestAgeSeconds returns the smallest age across sensor types", async () => {
  const recent = new Date(Date.now() - 2000).toISOString();
  const stale = new Date(Date.now() - 500000).toISOString();
  const doc = new FakeDoc({
    wind_speed_ms: [{ sensor_type: "wind_speed_ms", site_id: "turbine-1", window_end: stale }],
    blade_vibration_mm: [{ sensor_type: "blade_vibration_mm", site_id: "turbine-1", window_end: recent }],
  });
  const age = await freshestAgeSeconds(doc, "table");
  assert.ok(age < 10);
});
