"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildState, sampleTick, dispatchTick, postBatch } = require("./sensor");
const { SENSOR_PROFILES } = require("./profiles");

test("buildState seeds value at profile.start with an empty outbox", () => {
  const state = buildState("temperature_c", "hall-1", SENSOR_PROFILES.temperature_c);
  assert.equal(state.value, 22);
  assert.deepEqual(state.outbox, []);
});

test("sampleTick appends one timestamped reading and moves the walk within bounds", () => {
  const state = buildState("humidity_pct", "hall-2", SENSOR_PROFILES.humidity_pct);
  sampleTick(state);
  assert.equal(state.outbox.length, 1);
  assert.equal(typeof state.outbox[0].ts, "string");
  assert.ok(state.outbox[0].value >= 10 && state.outbox[0].value <= 80);
});

test("dispatchTick is a no-op returning 0 when the outbox is empty", async () => {
  const state = buildState("power_load_kw", "hall-1", SENSOR_PROFILES.power_load_kw);
  const sent = await dispatchTick(state, async () => {});
  assert.equal(sent, 0);
});

test("dispatchTick drains the whole outbox in one post call and empties it on success", async () => {
  const state = buildState("airflow_cfm", "hall-1", SENSOR_PROFILES.airflow_cfm);
  sampleTick(state);
  sampleTick(state);
  sampleTick(state);
  const posted = [];
  const sent = await dispatchTick(state, async (batch) => posted.push(batch));
  assert.equal(sent, 3);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].length, 3);
  assert.deepEqual(state.outbox, []);
});

test("dispatchTick puts the batch back in front of new readings on a failed post", async () => {
  const state = buildState("dust_density_ugm3", "hall-2", SENSOR_PROFILES.dust_density_ugm3);
  sampleTick(state);
  const failing = () => Promise.reject(new Error("network down"));
  await assert.rejects(() => dispatchTick(state, failing));
  assert.equal(state.outbox.length, 1, "the failed batch should be retained for the next dispatch attempt");
});

test("sampling and dispatch are independent: sampling without a due dispatch never clears the outbox", () => {
  const state = buildState("temperature_c", "hall-1", SENSOR_PROFILES.temperature_c);
  sampleTick(state);
  sampleTick(state);
  assert.equal(state.outbox.length, 2, "readings accumulate until a separate dispatch call drains them");
});

test("postBatch POSTs sensor_type/site_id/unit/readings as JSON to the gateway URL", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true };
  };
  try {
    await postBatch("http://fog:8000/ingest", "temperature_c", "hall-1", "C", [{ ts: "t0", value: 22.1 }]);
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://fog:8000/ingest");
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.sensor_type, "temperature_c");
  assert.equal(body.site_id, "hall-1");
  assert.equal(body.unit, "C");
  assert.deepEqual(body.readings, [{ ts: "t0", value: 22.1 }]);
});
