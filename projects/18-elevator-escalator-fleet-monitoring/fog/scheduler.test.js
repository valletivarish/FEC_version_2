"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startWindowLoop, sleep } = require("./scheduler");

test("sleep resolves after roughly the requested delay", async () => {
  const start = Date.now();
  await sleep(20);
  assert.ok(Date.now() - start >= 15);
});

test("startWindowLoop calls onFlush once per windowSeconds, recursively", async () => {
  let calls = 0;
  const stop = startWindowLoop(0.02, async () => {
    calls += 1;
  });
  await sleep(95);
  stop();
  assert.ok(calls >= 3, `expected at least 3 flush calls, got ${calls}`);
});

test("stop() prevents further recursive ticks", async () => {
  let calls = 0;
  const stop = startWindowLoop(0.015, async () => {
    calls += 1;
  });
  await sleep(40);
  stop();
  const callsAtStop = calls;
  await sleep(60);
  assert.equal(calls, callsAtStop, "no further onFlush calls should happen after stop()");
});

test("an onFlush rejection is caught and logged without breaking the recursive chain", async () => {
  let calls = 0;
  const stop = startWindowLoop(0.015, async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
  });
  await sleep(70);
  stop();
  assert.ok(calls >= 2, "the chain must keep recursing even after one flush throws");
});
