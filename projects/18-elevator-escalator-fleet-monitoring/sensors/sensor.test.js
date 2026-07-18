"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { initCarState, sampleCar, dispatchOutbox } = require("./sensor");

test("sampleCar grows the outbox and stays within profile bounds", () => {
  const car = initCarState("cab_vibration_mm", "tower-a", { unit: "mm", lo: 0, hi: 15, start: 1, step: 0.8 });
  for (let i = 0; i < 20; i++) sampleCar(car);
  assert.equal(car.outbox.length, 20);
  for (const reading of car.outbox) {
    assert.ok(reading.value >= 0 && reading.value <= 15);
    assert.ok(typeof reading.ts === "string");
  }
});

test("dispatchOutbox does nothing when the outbox is empty", async () => {
  const car = initCarState("motor_temp_c", "tower-a", { unit: "C", lo: 30, hi: 110, start: 55, step: 4 });
  let called = false;
  await dispatchOutbox(car, async () => {
    called = true;
  });
  assert.equal(called, false);
});

test("dispatchOutbox drains the outbox in arrival order and calls post once", async () => {
  const car = initCarState("load_weight_kg", "tower-b", { unit: "kg", lo: 0, hi: 1200, start: 300, step: 100 });
  car.outbox = [{ ts: "t0", value: 300 }, { ts: "t1", value: 340 }];
  let seenBatch = null;
  await dispatchOutbox(car, async (batch) => {
    seenBatch = batch;
  });
  assert.deepEqual(seenBatch, [{ ts: "t0", value: 300 }, { ts: "t1", value: 340 }]);
  assert.equal(car.outbox.length, 0);
});

test("dispatchOutbox swallows a post() failure and retains the batch instead of throwing", async () => {
  const car = initCarState("travel_speed_mps", "tower-a", { unit: "m/s", lo: 0, hi: 4, start: 1.5, step: 0.3 });
  car.outbox = [{ ts: "t0", value: 1.5 }];

  await dispatchOutbox(car, async () => {
    throw new Error("network down");
  });

  assert.equal(car.outbox.length, 1, "failed batch should be retained, not dropped");
});

test("dispatchOutbox preserves order when new readings arrive during a failed post", async () => {
  const car = initCarState("door_cycle_count", "tower-b", { unit: "count", lo: 0, hi: 500, start: 50, step: 25 });
  car.outbox = [{ ts: "t0", value: 50 }];

  const pending = dispatchOutbox(car, async () => {
    // simulate a reading arriving while the (failing) post is in flight
    car.outbox.push({ ts: "t1", value: 75 });
    throw new Error("boom");
  });
  await pending;

  assert.deepEqual(car.outbox, [{ ts: "t0", value: 50 }, { ts: "t1", value: 75 }]);
});
