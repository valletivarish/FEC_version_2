"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { weightTrend, broodThermalState, summarizeColonyHealth } = require("./colonyNarrative");

test("weightTrend reports steady with fewer than two windows", () => {
  assert.equal(weightTrend([]), "steady");
  assert.equal(weightTrend([{ avg: 35 }]), "steady");
});

test("weightTrend reports rising when weight climbs by at least 0.5kg", () => {
  assert.equal(weightTrend([{ avg: 34.0 }, { avg: 34.2 }, { avg: 35.0 }]), "rising");
});

test("weightTrend reports falling when weight drops by at least 0.5kg", () => {
  assert.equal(weightTrend([{ avg: 36.0 }, { avg: 35.5 }, { avg: 35.2 }]), "falling");
});

test("weightTrend reports steady when the change is within the noise band", () => {
  assert.equal(weightTrend([{ avg: 35.0 }, { avg: 35.1 }, { avg: 35.2 }]), "steady");
});

test("broodThermalState reports unknown with no data", () => {
  assert.equal(broodThermalState([]), "unknown");
});

test("broodThermalState reports stable when the recent range is small and no alerts fired", () => {
  assert.equal(broodThermalState([{ avg: 34.0, alerts: [] }, { avg: 34.5, alerts: [] }, { avg: 34.2, alerts: [] }]), "stable");
});

test("broodThermalState reports fluctuating when the recent range is wide but no alert fired", () => {
  assert.equal(broodThermalState([{ avg: 31.0, alerts: [] }, { avg: 35.0, alerts: [] }]), "fluctuating");
});

test("broodThermalState reports critical whenever any recent window already carries an alert", () => {
  assert.equal(broodThermalState([{ avg: 34.0, alerts: [] }, { avg: 37.0, alerts: ["brood_overheat_risk"] }]), "critical");
});

test("summarizeColonyHealth composes a single plain sentence combining trend + stability + alert count", () => {
  const health = summarizeColonyHealth(
    "apiary-a",
    [{ avg: 34.0 }, { avg: 35.0 }],
    [{ avg: 34.0, alerts: [] }, { avg: 34.3, alerts: [] }],
    0
  );
  assert.equal(health.trend, "rising");
  assert.equal(health.stability, "stable");
  assert.match(health.sentence, /^apiary-a: hive weight is rising/);
  assert.match(health.sentence, /no active alerts\.$/);
});

test("summarizeColonyHealth pluralizes the alert count correctly", () => {
  const one = summarizeColonyHealth("apiary-b", [], [], 1);
  assert.match(one.sentence, /1 active alert\.$/);
  const many = summarizeColonyHealth("apiary-b", [], [], 3);
  assert.match(many.sentence, /3 active alerts\.$/);
});

test("summarizeColonyHealth reflects a falling+critical colony accurately", () => {
  const health = summarizeColonyHealth(
    "apiary-b",
    [{ avg: 30.0 }, { avg: 28.0 }],
    [{ avg: 37.0, alerts: ["brood_overheat_risk"] }],
    1
  );
  assert.equal(health.trend, "falling");
  assert.equal(health.stability, "critical");
  assert.match(health.sentence, /falling/);
  assert.match(health.sentence, /breached a safe threshold/);
});
