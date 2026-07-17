"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSamplerState, beginSampling, flushOutboxOnce, beginDispatchLoop } = require("./sensor");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("beginSampling reschedules itself and grows the outbox over time", async () => {
  const sampler = createSamplerState("turbidity_ntu", "plant-1", { unit: "NTU", lo: 0, hi: 15, start: 1.5, step: 0.4 }, 10_000);
  beginSampling(sampler, 15);
  await sleep(70);
  clearInterval(sampler.sampleTimer);
  assert.ok(sampler.outbox.length >= 3, `expected several samples, got ${sampler.outbox.length}`);
  for (const reading of sampler.outbox) {
    assert.ok(reading.value >= 0 && reading.value <= 15);
    assert.ok(typeof reading.ts === "string");
  }
});

test("flushOutboxOnce does nothing when the outbox is empty", async () => {
  const sampler = createSamplerState("ph_level", "plant-1", { unit: "pH", lo: 5.5, hi: 9, start: 7, step: 0.15 }, 0);
  let called = false;
  const fired = await flushOutboxOnce(sampler, async () => {
    called = true;
  });
  assert.equal(fired, false);
  assert.equal(called, false);
});

test("flushOutboxOnce does nothing when items are pending but the dispatch interval has not elapsed", async () => {
  const sampler = createSamplerState("chlorine_ppm", "plant-1", { unit: "ppm", lo: 0, hi: 3, start: 0.8, step: 0.15 }, 60_000);
  sampler.outbox = [{ ts: "t0", value: 0.8 }];
  sampler.lastDispatch = Date.now();
  let called = false;
  const fired = await flushOutboxOnce(sampler, async () => {
    called = true;
  });
  assert.equal(fired, false);
  assert.equal(called, false);
  assert.equal(sampler.outbox.length, 1, "batch should remain queued, not dropped");
});

test("flushOutboxOnce drains and dispatches in arrival order once due", async () => {
  const sampler = createSamplerState("flow_rate_lps", "plant-2", { unit: "L/s", lo: 5, hi: 120, start: 60, step: 8 }, 0);
  sampler.outbox = [{ ts: "t0", value: 55 }, { ts: "t1", value: 58 }];
  sampler.lastDispatch = Date.now() - 1000;

  let seenBatch = null;
  const fired = await flushOutboxOnce(sampler, async (batch) => {
    seenBatch = batch;
  });

  assert.equal(fired, true);
  assert.deepEqual(seenBatch, [{ ts: "t0", value: 55 }, { ts: "t1", value: 58 }]);
  assert.equal(sampler.outbox.length, 0);
});

test("flushOutboxOnce restores the batch to the front of the outbox on dispatch failure", async () => {
  const sampler = createSamplerState("pressure_bar", "plant-1", { unit: "bar", lo: 0.5, hi: 8, start: 4, step: 0.4 }, 0);
  sampler.outbox = [{ ts: "t0", value: 4.1 }];
  sampler.lastDispatch = Date.now() - 1000;

  await assert.rejects(() =>
    flushOutboxOnce(sampler, async () => {
      throw new Error("network down");
    })
  );
  assert.equal(sampler.outbox.length, 1, "failed batch should be retained, not dropped");
});

test("beginDispatchLoop runs opportunistically via setImmediate and fires once due", async () => {
  const sampler = createSamplerState("pressure_bar", "plant-2", { unit: "bar", lo: 0.5, hi: 8, start: 4, step: 0.4 }, 20);
  sampler.outbox = [{ ts: "t0", value: 4.2 }];
  sampler.lastDispatch = Date.now();

  const seenBatches = [];
  const stop = beginDispatchLoop(sampler, async (batch) => {
    seenBatches.push(batch);
  });

  await sleep(80);
  stop();
  assert.ok(seenBatches.length >= 1, "expected the opportunistic loop to fire at least once");
  assert.equal(sampler.outbox.length, 0);
});
