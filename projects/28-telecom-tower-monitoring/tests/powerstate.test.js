import test from "node:test";
import assert from "node:assert/strict";
import { autonomyMinutes, trend, powerSource, siteState, AUTONOMY_CAP_MIN } from "../backend/dashboard/powerstate.js";

test("autonomy is remaining amp-hours divided by load, in minutes", () => {
  assert.equal(autonomyMinutes(100, 40), 300); // 200Ah / 40A = 5h
  assert.equal(autonomyMinutes(50, 20), 300);  // 100Ah / 20A = 5h
});

test("autonomy clamps battery percent and caps the estimate", () => {
  assert.equal(autonomyMinutes(150, 40), 300); // pct clamped to 100
  assert.equal(autonomyMinutes(100, 0), AUTONOMY_CAP_MIN); // no load -> capped
  assert.equal(autonomyMinutes(100, 1), AUTONOMY_CAP_MIN); // tiny load -> capped
});

test("trend classifies a series by its net change", () => {
  assert.equal(trend([10, 12, 15]), "rising");
  assert.equal(trend([80, 70, 60]), "falling");
  assert.equal(trend([50, 50.5, 50]), "steady");
  assert.equal(trend([42]), "steady");
});

test("power source prefers the genset when its fuel is draining", () => {
  assert.equal(powerSource({ batteryTrend: "falling", fuelTrend: "falling", batteryCritical: false }), "on_genset");
});

test("power source reports on_battery when battery drains and genset is idle", () => {
  assert.equal(powerSource({ batteryTrend: "falling", fuelTrend: "steady", batteryCritical: false }), "on_battery");
});

test("power source reports on_grid when the battery is holding or charging", () => {
  assert.equal(powerSource({ batteryTrend: "rising", fuelTrend: "steady", batteryCritical: false }), "on_grid");
});

test("a critical battery degrades the site regardless of trends", () => {
  assert.equal(powerSource({ batteryTrend: "rising", fuelTrend: "steady", batteryCritical: true }), "degraded");
});

test("siteState fuses battery, load and genset into one view", () => {
  const state = siteState({
    battery_charge_pct: { last: 60, series: [80, 70, 60] },
    dc_load_amps: { last: 30, series: [30] },
    genset_fuel_pct: { last: 90, series: [90, 90] },
  });
  assert.equal(state.source, "on_battery");
  assert.equal(state.battery_pct, 60);
  assert.equal(state.load_amps, 30);
  assert.equal(state.autonomy_minutes, autonomyMinutes(60, 30));
});

test("siteState degrades when the battery is below the critical floor", () => {
  const state = siteState({
    battery_charge_pct: { last: 10, series: [12, 11, 10] },
    dc_load_amps: { last: 40, series: [40] },
    genset_fuel_pct: { last: 5, series: [8, 5] },
  });
  assert.equal(state.source, "degraded");
});
