"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildState, sampleTick, dispatchTick, postBatch } = require("./sensor");

test("buildState seeds value from profile.start and starts with an empty outbox", () => {
  const state = buildState("fill_level_pct", "district-a", { start: 25, lo: 0, hi: 100, step: 8, unit: "%" });
  assert.equal(state.value, 25);
  assert.deepEqual(state.outbox, []);
  assert.equal(state.sensorType, "fill_level_pct");
  assert.equal(state.siteId, "district-a");
});

test("sampleTick pushes a {ts, value} reading and updates state.value", () => {
  const state = buildState("gas_level_ppm", "district-b", { start: 50, lo: 0, hi: 1000, step: 40, unit: "ppm" });
  const returned = sampleTick(state);
  assert.equal(state.outbox.length, 1);
  assert.equal(typeof state.outbox[0].ts, "string");
  assert.equal(typeof state.outbox[0].value, "number");
  assert.equal(returned, state.value);
});

test("dispatchTick returns 0 and calls nothing when the outbox is empty", async () => {
  const state = buildState("bin_weight_kg", "district-a", { start: 80, lo: 0, hi: 500, step: 25, unit: "kg" });
  let called = false;
  const sent = await dispatchTick(state, async () => {
    called = true;
  });
  assert.equal(sent, 0);
  assert.equal(called, false);
});

test("dispatchTick drains the outbox and posts the batch", async () => {
  const state = buildState("lid_open_count", "district-a", { start: 1, lo: 0, hi: 20, step: 1, unit: "count" });
  sampleTick(state);
  sampleTick(state);
  let posted = null;
  const sent = await dispatchTick(state, async (batch) => {
    posted = batch;
  });
  assert.equal(sent, 2);
  assert.equal(posted.length, 2);
  assert.deepEqual(state.outbox, []);
});

test("dispatchTick restores the outbox in order on failure, ahead of anything sampled meanwhile", async () => {
  const state = buildState("internal_temp_c", "district-b", { start: 22, lo: 10, hi: 70, step: 3, unit: "C" });
  sampleTick(state); // reading A
  const readingA = state.outbox[0];

  await assert.rejects(
    dispatchTick(state, async () => {
      // simulate a reading arriving while the failing POST is in flight
      state.outbox.push({ ts: "late", value: 999 });
      throw new Error("network down");
    })
  );

  assert.equal(state.outbox.length, 2);
  assert.equal(state.outbox[0], readingA, "the failed batch is restored ahead of the late-arriving reading");
  assert.equal(state.outbox[1].ts, "late");
});

test("postBatch POSTs the expected JSON envelope shape", async () => {
  const originalFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true };
  };
  try {
    await postBatch("http://fog:8000/ingest", "fill_level_pct", "district-a", "%", [{ ts: "t0", value: 30 }]);
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(captured.url, "http://fog:8000/ingest");
  assert.equal(captured.opts.method, "POST");
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.sensor_type, "fill_level_pct");
  assert.equal(body.site_id, "district-a");
  assert.equal(body.unit, "%");
  assert.deepEqual(body.readings, [{ ts: "t0", value: 30 }]);
});
