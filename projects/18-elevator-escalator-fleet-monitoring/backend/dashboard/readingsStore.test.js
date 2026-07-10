"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTowerSummaries, getTowerSummary, freshestAgeSeconds, latestWindowsFor, SENSOR_TYPES } = require("./readingsStore");

function fakeDoc(itemsByQuery) {
  return {
    send: async (command) => {
      const sensorType = command.input.ExpressionAttributeValues[":st"];
      return { Items: itemsByQuery[sensorType] || [] };
    },
  };
}

test("latestWindowsFor queries by sensor_type and returns items oldest-first", async () => {
  const doc = fakeDoc({
    motor_temp_c: [
      { sensor_type: "motor_temp_c", sort_key: "b", latest: 70 },
      { sensor_type: "motor_temp_c", sort_key: "a", latest: 60 },
    ],
  });
  const items = await latestWindowsFor(doc, "eef-readings", "motor_temp_c", 10);
  assert.deepEqual(items.map((i) => i.latest), [60, 70]);
});

test("buildTowerSummaries groups the latest window per sensor type onto each tower", async () => {
  const doc = fakeDoc({
    motor_temp_c: [{ sensor_type: "motor_temp_c", site_id: "tower-a", latest: 60, alerts: [] }],
    door_cycle_count: [{ sensor_type: "door_cycle_count", site_id: "tower-a", latest: 120, alerts: [] }],
    cab_vibration_mm: [{ sensor_type: "cab_vibration_mm", site_id: "tower-b", latest: 7, alerts: ["ride_quality_fault"] }],
    load_weight_kg: [],
    travel_speed_mps: [],
  });
  const towers = await buildTowerSummaries(doc, "eef-readings");
  assert.equal(towers.length, 2);
  const towerA = towers.find((t) => t.site_id === "tower-a");
  const towerB = towers.find((t) => t.site_id === "tower-b");
  assert.equal(towerA.metrics.motor_temp_c.latest, 60);
  assert.equal(towerA.nominal, true);
  assert.equal(towerB.metrics.cab_vibration_mm.latest, 7);
  assert.equal(towerB.nominal, false);
  assert.deepEqual(towerB.alerts, [{ sensor_type: "cab_vibration_mm", key: "ride_quality_fault" }]);
});

test("buildTowerSummaries returns both towers even with zero data (all sensor queries empty)", async () => {
  const doc = fakeDoc({});
  const towers = await buildTowerSummaries(doc, "eef-readings");
  assert.deepEqual(towers.map((t) => t.site_id), ["tower-a", "tower-b"]);
  assert.deepEqual(towers[0].metrics, {});
  assert.equal(towers[0].nominal, true);
});

test("getTowerSummary returns null for an unknown tower id", async () => {
  const doc = fakeDoc({});
  const tower = await getTowerSummary(doc, "eef-readings", "tower-z");
  assert.equal(tower, null);
});

test("getTowerSummary returns the matching tower's summary", async () => {
  const doc = fakeDoc({
    motor_temp_c: [{ sensor_type: "motor_temp_c", site_id: "tower-b", latest: 88, alerts: ["motor_overheat_risk"] }],
  });
  const tower = await getTowerSummary(doc, "eef-readings", "tower-b");
  assert.equal(tower.site_id, "tower-b");
  assert.equal(tower.nominal, false);
});

test("freshestAgeSeconds returns null when there is no data at all", async () => {
  const doc = fakeDoc({});
  const age = await freshestAgeSeconds(doc, "eef-readings");
  assert.equal(age, null);
});

test("freshestAgeSeconds returns the smallest age across all 5 sensor types", async () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 2000).toISOString();
  const stale = new Date(now.getTime() - 500_000).toISOString();
  const doc = fakeDoc({
    motor_temp_c: [{ sensor_type: "motor_temp_c", window_end: stale }],
    door_cycle_count: [{ sensor_type: "door_cycle_count", window_end: recent }],
  });
  const age = await freshestAgeSeconds(doc, "eef-readings");
  assert.ok(age < 10, `expected the freshest (2s-old) window to win, got age=${age}`);
});

test("SENSOR_TYPES covers exactly the 5 elevator/escalator sensors", () => {
  assert.deepEqual(
    new Set(SENSOR_TYPES),
    new Set(["motor_temp_c", "door_cycle_count", "cab_vibration_mm", "load_weight_kg", "travel_speed_mps"])
  );
});
