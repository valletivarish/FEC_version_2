"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { trendDirection, temperatureStability, describeColonyHealth } = require("./colonyNarrative");

test("trendDirection reports steady with fewer than two windows", () => {
  assert.equal(trendDirection([]), "steady");
  assert.equal(trendDirection([{ avg: 35 }]), "steady");
});

test("trendDirection reports rising when weight climbs by at least 0.5kg", () => {
  assert.equal(trendDirection([{ avg: 34.0 }, { avg: 34.2 }, { avg: 35.0 }]), "rising");
});

test("trendDirection reports falling when weight drops by at least 0.5kg", () => {
  assert.equal(trendDirection([{ avg: 36.0 }, { avg: 35.5 }, { avg: 35.2 }]), "falling");
});

test("trendDirection reports steady when the change is within the noise band", () => {
  assert.equal(trendDirection([{ avg: 35.0 }, { avg: 35.1 }, { avg: 35.2 }]), "steady");
});

test("temperatureStability reports unknown with no data", () => {
  assert.equal(temperatureStability([]), "unknown");
});

test("temperatureStability reports stable when the recent range is small and no alerts fired", () => {
  assert.equal(temperatureStability([{ avg: 34.0, alerts: [] }, { avg: 34.5, alerts: [] }, { avg: 34.2, alerts: [] }]), "stable");
});

test("temperatureStability reports fluctuating when the recent range is wide but no alert fired", () => {
  assert.equal(temperatureStability([{ avg: 31.0, alerts: [] }, { avg: 35.0, alerts: [] }]), "fluctuating");
});

test("temperatureStability reports critical whenever any recent window already carries an alert", () => {
  assert.equal(temperatureStability([{ avg: 34.0, alerts: [] }, { avg: 37.0, alerts: ["brood_overheat_risk"] }]), "critical");
});

test("describeColonyHealth composes a single plain sentence combining trend + stability + alert count", () => {
  const health = describeColonyHealth(
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

test("describeColonyHealth pluralizes the alert count correctly", () => {
  const one = describeColonyHealth("apiary-b", [], [], 1);
  assert.match(one.sentence, /1 active alert\.$/);
  const many = describeColonyHealth("apiary-b", [], [], 3);
  assert.match(many.sentence, /3 active alerts\.$/);
});

test("describeColonyHealth reflects a falling+critical colony accurately", () => {
  const health = describeColonyHealth(
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
