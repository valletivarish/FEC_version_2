"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildState, sampleTick, dispatchTick } = require("./sensor");

test("sampleTick grows the outbox and stays within profile bounds", () => {
  const state = buildState("cab_vibration_mm", "tower-a", { unit: "mm", lo: 0, hi: 15, start: 1, step: 0.8 });
  for (let i = 0; i < 20; i++) sampleTick(state);
  assert.equal(state.outbox.length, 20);
  for (const reading of state.outbox) {
    assert.ok(reading.value >= 0 && reading.value <= 15);
    assert.ok(typeof reading.ts === "string");
  }
});

test("dispatchTick does nothing when the outbox is empty", async () => {
  const state = buildState("motor_temp_c", "tower-a", { unit: "C", lo: 30, hi: 110, start: 55, step: 4 });
  let called = false;
  await dispatchTick(state, async () => {
    called = true;
  });
  assert.equal(called, false);
});

test("dispatchTick drains the outbox in arrival order and calls post once", async () => {
  const state = buildState("load_weight_kg", "tower-b", { unit: "kg", lo: 0, hi: 1200, start: 300, step: 100 });
  state.outbox = [{ ts: "t0", value: 300 }, { ts: "t1", value: 340 }];
  let seenBatch = null;
  await dispatchTick(state, async (batch) => {
    seenBatch = batch;
  });
  assert.deepEqual(seenBatch, [{ ts: "t0", value: 300 }, { ts: "t1", value: 340 }]);
  assert.equal(state.outbox.length, 0);
});

test("dispatchTick swallows a post() failure and retains the batch instead of throwing", async () => {
  const state = buildState("travel_speed_mps", "tower-a", { unit: "m/s", lo: 0, hi: 4, start: 1.5, step: 0.3 });
  state.outbox = [{ ts: "t0", value: 1.5 }];

  await dispatchTick(state, async () => {
    throw new Error("network down");
  });

  assert.equal(state.outbox.length, 1, "failed batch should be retained, not dropped");
});

test("dispatchTick preserves order when new readings arrive during a failed post", async () => {
  const state = buildState("door_cycle_count", "tower-b", { unit: "count", lo: 0, hi: 500, start: 50, step: 25 });
  state.outbox = [{ ts: "t0", value: 50 }];

  const pending = dispatchTick(state, async () => {
    // simulate a reading arriving while the (failing) post is in flight
    state.outbox.push({ ts: "t1", value: 75 });
    throw new Error("boom");
  });
  await pending;

  assert.deepEqual(state.outbox, [{ ts: "t0", value: 50 }, { ts: "t1", value: 75 }]);
});
