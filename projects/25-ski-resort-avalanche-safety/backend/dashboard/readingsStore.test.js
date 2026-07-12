"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SENSOR_TYPES,
  RISK_LEVELS,
  deriveRiskLevel,
  latestWindowsFor,
  buildSlopeSummaries,
  getSlopeSummary,
  freshestAgeSeconds,
} = require("./readingsStore");

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
  const doc = fakeDoc({ snow_temp_c: [{ sensor_type: "snow_temp_c", site_id: "slope-a", avg: -8 }, { sensor_type: "snow_temp_c", site_id: "slope-a", avg: -7 }] });
  const items = await latestWindowsFor(doc, "ska-readings", "snow_temp_c", 10);
  assert.equal(items.length, 2);
  assert.equal(items[0].avg, -8);
});

test("deriveRiskLevel returns LOW with no alerts", () => {
  assert.equal(deriveRiskLevel([]), "LOW");
  assert.equal(deriveRiskLevel(undefined), "LOW");
});

test("deriveRiskLevel maps each alert key to its risk level", () => {
  assert.equal(deriveRiskLevel(["insufficient_snow_coverage"]), "MODERATE");
  assert.equal(deriveRiskLevel(["lift_wind_halt"]), "HIGH");
  assert.equal(deriveRiskLevel(["snowpack_instability_risk"]), "HIGH");
  assert.equal(deriveRiskLevel(["avalanche_risk_detected"]), "EXTREME");
});

test("deriveRiskLevel keeps the worst (highest-severity) level when several alerts fire together", () => {
  assert.equal(deriveRiskLevel(["insufficient_snow_coverage", "avalanche_risk_detected"]), "EXTREME");
  assert.equal(deriveRiskLevel(["insufficient_snow_coverage", "lift_wind_halt"]), "HIGH");
});

test("RISK_LEVELS lists the four gauge levels worst-last", () => {
  assert.deepEqual(RISK_LEVELS, ["LOW", "MODERATE", "HIGH", "EXTREME"]);
});

test("buildSlopeSummaries groups the latest window per sensor type into each slope with a derived risk_level", async () => {
  const doc = fakeDoc({
    seismic_vibration_mg: [
      { sensor_type: "seismic_vibration_mg", site_id: "slope-a", unit: "milli-g", latest: 4.0, min: 2.0, max: 6.0, avg: 4.0, window_end: "e1", alerts: [] },
      { sensor_type: "seismic_vibration_mg", site_id: "slope-b", unit: "milli-g", latest: 30.0, min: 20.0, max: 35.0, avg: 30.0, window_end: "e1", alerts: ["avalanche_risk_detected"] },
    ],
    snowpack_depth_cm: [], snow_temp_c: [], wind_speed_kmh: [], lift_chair_count: [],
  });

  const slopes = await buildSlopeSummaries(doc, "ska-readings");
  assert.equal(slopes.length, 2);
  const a = slopes.find((s) => s.site_id === "slope-a");
  const b = slopes.find((s) => s.site_id === "slope-b");
  assert.equal(a.metrics.seismic_vibration_mg.latest, 4.0);
  assert.equal(a.risk_level, "LOW");
  assert.equal(b.risk_level, "EXTREME", "slope-b has an active avalanche_risk_detected alert");
  assert.deepEqual(b.alerts, [{ sensor_type: "seismic_vibration_mg", key: "avalanche_risk_detected" }]);
});

test("buildSlopeSummaries returns both slopes even with no data yet, sorted by site_id, all LOW risk", async () => {
  const doc = fakeDoc({});
  const slopes = await buildSlopeSummaries(doc, "ska-readings");
  assert.deepEqual(slopes.map((s) => s.site_id), ["slope-a", "slope-b"]);
  assert.deepEqual(slopes[0].metrics, {});
  assert.equal(slopes[0].risk_level, "LOW");
});

test("getSlopeSummary returns a single slope by site_id, or null when unknown", async () => {
  const doc = fakeDoc({});
  const slope = await getSlopeSummary(doc, "ska-readings", "slope-a");
  assert.equal(slope.site_id, "slope-a");
  assert.equal(await getSlopeSummary(doc, "ska-readings", "slope-z"), null);
});

test("freshestAgeSeconds returns null when the table is entirely empty", async () => {
  const doc = fakeDoc({});
  assert.equal(await freshestAgeSeconds(doc, "ska-readings"), null);
});

test("freshestAgeSeconds returns the smallest age across all sensor types", async () => {
  const now = Date.now();
  const recentEnd = new Date(now - 2000).toISOString();
  const staleEnd = new Date(now - 50_000).toISOString();
  const doc = fakeDoc({
    snowpack_depth_cm: [{ sensor_type: "snowpack_depth_cm", site_id: "slope-a", window_end: staleEnd }],
    snow_temp_c: [{ sensor_type: "snow_temp_c", site_id: "slope-a", window_end: recentEnd }],
  });
  const age = await freshestAgeSeconds(doc, "ska-readings");
  assert.ok(age !== null && age < 5, `expected the freshest age to reflect the recent window, got ${age}`);
});

test("SENSOR_TYPES lists all five ski-resort sensors", () => {
  assert.deepEqual(SENSOR_TYPES, ["snowpack_depth_cm", "snow_temp_c", "wind_speed_kmh", "seismic_vibration_mg", "lift_chair_count"]);
});
