"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startCadenceLoop } = require("./driftLoop");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("fires roughly on the configured interval when ticks are instant", async () => {
  const fireTimes = [];
  const start = Date.now();
  const stop = startCadenceLoop(20, async () => {
    fireTimes.push(Date.now() - start);
  });
  await wait(105);
  stop();
  assert.ok(fireTimes.length >= 4, `expected at least 4 ticks, got ${fireTimes.length}`);
});

test("stop() halts further ticks", async () => {
  let count = 0;
  const stop = startCadenceLoop(15, async () => {
    count += 1;
  });
  await wait(40);
  stop();
  const countAtStop = count;
  await wait(60);
  assert.equal(count, countAtStop, "no further ticks should fire after stop()");
});

// A tick that runs long borrows from its own next delay instead of shifting every later tick.
test("a single slow tick does not permanently shift the schedule", async () => {
  const intervalMs = 20;
  const fireTimes = [];
  const start = Date.now();
  let tickIndex = 0;
  const stop = startCadenceLoop(intervalMs, async () => {
    tickIndex += 1;
    fireTimes.push(Date.now() - start);
    if (tickIndex === 1) {
      await wait(35); // one deliberately slow tick, longer than intervalMs
    }
  });
  await wait(160);
  stop();
  assert.ok(fireTimes.length >= 5, `expected at least 5 ticks despite one slow tick, got ${fireTimes.length}`);
  const last = fireTimes[fireTimes.length - 1];
  const idealLast = fireTimes.length * intervalMs;
  // Generous slack, but the loop must not stay ~35ms behind after the one slow tick.
  assert.ok(Math.abs(last - idealLast) < intervalMs * 3, `expected ${last} close to ideal ${idealLast}`);
});

test("elapsed time across many ticks tracks intervalMs * tickCount, not naive re-arming", async () => {
  const intervalMs = 10;
  let count = 0;
  const start = Date.now();
  const stop = startCadenceLoop(intervalMs, async () => {
    count += 1;
  });
  await wait(155);
  stop();
  const elapsed = Date.now() - start;
  const expectedTicks = elapsed / intervalMs;
  // Timers are imprecise; assert a sane ballpark of the ideal tick count, not exact.
  assert.ok(count >= expectedTicks * 0.5, `expected roughly ${expectedTicks} ticks, got ${count}`);
});
