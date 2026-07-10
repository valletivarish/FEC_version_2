"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fireRiskIndex, riskBand } = require("./fireRisk");

test("fireRiskIndex is 0 when nothing crosses a risk-contribution threshold", () => {
  const metrics = {
    temperature_c: { avg: 20 },
    smoke_density_ppm: { avg: 10 },
    wind_speed_kmh: { avg: 10 },
    soil_moisture_pct: { avg: 30 },
  };
  assert.equal(fireRiskIndex(metrics), 0);
});

test("fireRiskIndex adds one point per crossed contributor, independently", () => {
  assert.equal(fireRiskIndex({ temperature_c: { avg: 31 } }), 1);
  assert.equal(fireRiskIndex({ smoke_density_ppm: { avg: 61 } }), 1);
  assert.equal(fireRiskIndex({ wind_speed_kmh: { avg: 36 } }), 1);
  assert.equal(fireRiskIndex({ soil_moisture_pct: { avg: 19 } }), 1);
});

test("fireRiskIndex reaches the maximum of 4 when all four contributors cross", () => {
  const metrics = {
    temperature_c: { avg: 35 },
    smoke_density_ppm: { avg: 70 },
    wind_speed_kmh: { avg: 40 },
    soil_moisture_pct: { avg: 15 },
  };
  assert.equal(fireRiskIndex(metrics), 4);
});

test("fireRiskIndex risk-contribution thresholds are strictly earlier than the hard alert thresholds", () => {
  // temperature_c hard alert fires at avg > 42; risk contribution at > 30
  assert.equal(fireRiskIndex({ temperature_c: { avg: 35 } }), 1);
  // smoke_density_ppm hard alert fires at avg > 150; risk contribution at > 60
  assert.equal(fireRiskIndex({ smoke_density_ppm: { avg: 100 } }), 1);
});

test("fireRiskIndex tolerates missing metrics without contributing a point", () => {
  assert.equal(fireRiskIndex({}), 0);
  assert.equal(fireRiskIndex({ temperature_c: { avg: 35 }, wind_speed_kmh: undefined }), 1);
});

test("humidity_pct never contributes to the score even at extreme values", () => {
  assert.equal(fireRiskIndex({ humidity_pct: { avg: 0 } }), 0);
  assert.equal(fireRiskIndex({ humidity_pct: { avg: 100 } }), 0);
});

test("riskBand maps 0-4 to safe..extreme and clamps out-of-range input", () => {
  assert.equal(riskBand(0), "safe");
  assert.equal(riskBand(4), "extreme");
  assert.equal(riskBand(-1), "safe");
  assert.equal(riskBand(9), "extreme");
});
