"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { openRunLedger, runLedgerKey, logReading, drainRunLedger } = require("./windowBuffer");

test("openRunLedger returns an empty Map", () => {
  const ledger = openRunLedger();
  assert.ok(ledger instanceof Map);
  assert.equal(ledger.size, 0);
});

test("logReading groups readings under sensor_type::site_id directly at write time", () => {
  const ledger = openRunLedger();
  logReading(ledger, "motor_temp_c", "tower-a", { ts: "t0", value: 55 });
  logReading(ledger, "motor_temp_c", "tower-a", { ts: "t1", value: 57 });
  logReading(ledger, "motor_temp_c", "tower-b", { ts: "t0", value: 60 });

  assert.equal(ledger.size, 2);
  assert.deepEqual(ledger.get(runLedgerKey("motor_temp_c", "tower-a")), [
    { ts: "t0", value: 55 },
    { ts: "t1", value: 57 },
  ]);
});

test("drainRunLedger returns one group per key and clears the live ledger", () => {
  const ledger = openRunLedger();
  logReading(ledger, "cab_vibration_mm", "tower-a", { ts: "t0", value: 2 });
  logReading(ledger, "cab_vibration_mm", "tower-b", { ts: "t0", value: 5 });

  const groups = drainRunLedger(ledger);
  assert.equal(groups.length, 2);
  assert.equal(ledger.size, 0, "ledger must be empty immediately after the drain");

  const towerA = groups.find((g) => g.siteId === "tower-a");
  assert.equal(towerA.sensorType, "cab_vibration_mm");
  assert.deepEqual(towerA.readings, [{ ts: "t0", value: 2 }]);
});

test("readings added after a drain start a fresh group, not appended to the sealed one", () => {
  const ledger = openRunLedger();
  logReading(ledger, "travel_speed_mps", "tower-a", { ts: "t0", value: 1.5 });
  const firstDrain = drainRunLedger(ledger);
  logReading(ledger, "travel_speed_mps", "tower-a", { ts: "t1", value: 1.6 });
  const secondDrain = drainRunLedger(ledger);

  assert.equal(firstDrain.length, 1);
  assert.equal(secondDrain.length, 1);
  assert.deepEqual(secondDrain[0].readings, [{ ts: "t1", value: 1.6 }]);
});

test("drainRunLedger on an empty ledger returns an empty array", () => {
  const ledger = openRunLedger();
  assert.deepEqual(drainRunLedger(ledger), []);
});

test("runLedgerKey handles site ids that could plausibly appear in this domain", () => {
  assert.equal(runLedgerKey("door_cycle_count", "tower-b"), "door_cycle_count::tower-b");
});
