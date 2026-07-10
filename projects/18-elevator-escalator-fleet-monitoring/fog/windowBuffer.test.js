"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBuffer, bufferKey, addReading, takeSnapshot } = require("./windowBuffer");

test("createBuffer returns an empty Map", () => {
  const buffer = createBuffer();
  assert.ok(buffer instanceof Map);
  assert.equal(buffer.size, 0);
});

test("addReading groups readings under sensor_type::site_id directly at write time", () => {
  const buffer = createBuffer();
  addReading(buffer, "motor_temp_c", "tower-a", { ts: "t0", value: 55 });
  addReading(buffer, "motor_temp_c", "tower-a", { ts: "t1", value: 57 });
  addReading(buffer, "motor_temp_c", "tower-b", { ts: "t0", value: 60 });

  assert.equal(buffer.size, 2);
  assert.deepEqual(buffer.get(bufferKey("motor_temp_c", "tower-a")), [
    { ts: "t0", value: 55 },
    { ts: "t1", value: 57 },
  ]);
});

test("takeSnapshot returns one group per key and clears the live buffer", () => {
  const buffer = createBuffer();
  addReading(buffer, "cab_vibration_mm", "tower-a", { ts: "t0", value: 2 });
  addReading(buffer, "cab_vibration_mm", "tower-b", { ts: "t0", value: 5 });

  const groups = takeSnapshot(buffer);
  assert.equal(groups.length, 2);
  assert.equal(buffer.size, 0, "buffer must be empty immediately after the snapshot");

  const towerA = groups.find((g) => g.siteId === "tower-a");
  assert.equal(towerA.sensorType, "cab_vibration_mm");
  assert.deepEqual(towerA.readings, [{ ts: "t0", value: 2 }]);
});

test("readings added after a snapshot start a fresh group, not appended to the sealed one", () => {
  const buffer = createBuffer();
  addReading(buffer, "travel_speed_mps", "tower-a", { ts: "t0", value: 1.5 });
  const firstSnapshot = takeSnapshot(buffer);
  addReading(buffer, "travel_speed_mps", "tower-a", { ts: "t1", value: 1.6 });
  const secondSnapshot = takeSnapshot(buffer);

  assert.equal(firstSnapshot.length, 1);
  assert.equal(secondSnapshot.length, 1);
  assert.deepEqual(secondSnapshot[0].readings, [{ ts: "t1", value: 1.6 }]);
});

test("takeSnapshot on an empty buffer returns an empty array", () => {
  const buffer = createBuffer();
  assert.deepEqual(takeSnapshot(buffer), []);
});

test("bufferKey handles site ids that could plausibly appear in this domain", () => {
  assert.equal(bufferKey("door_cycle_count", "tower-b"), "door_cycle_count::tower-b");
});
