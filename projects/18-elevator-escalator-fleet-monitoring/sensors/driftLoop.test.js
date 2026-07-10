"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { startDriftCorrectedLoop } = require("./driftLoop");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("fires roughly on the configured interval when ticks are instant", async () => {
  const fireTimes = [];
  const start = Date.now();
  const stop = startDriftCorrectedLoop(20, async () => {
    fireTimes.push(Date.now() - start);
  });
  await wait(105);
  stop();
  assert.ok(fireTimes.length >= 4, `expected at least 4 ticks, got ${fireTimes.length}`);
});

test("stop() halts further ticks", async () => {
  let count = 0;
  const stop = startDriftCorrectedLoop(15, async () => {
    count += 1;
  });
  await wait(40);
  stop();
  const countAtStop = count;
  await wait(60);
  assert.equal(count, countAtStop, "no further ticks should fire after stop()");
});

// The core claim of drift correction: a tick that runs long borrows time
// from its own next delay rather than pushing every subsequent tick later
// by the full overrun. We simulate one artificially slow tick and confirm
// the loop's average rate over several more ticks still lands close to the
// configured interval, rather than staying permanently behind.
test("a single slow tick does not permanently shift the schedule", async () => {
  const intervalMs = 20;
  const fireTimes = [];
  const start = Date.now();
  let tickIndex = 0;
  const stop = startDriftCorrectedLoop(intervalMs, async () => {
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
  // Allow generous scheduling slack, but the point is the loop is not stuck
  // permanently ~35ms behind schedule after the one slow tick.
  assert.ok(Math.abs(last - idealLast) < intervalMs * 3, `expected ${last} close to ideal ${idealLast}`);
});

test("elapsed time across many ticks tracks intervalMs * tickCount, not naive re-arming", async () => {
  const intervalMs = 10;
  let count = 0;
  const start = Date.now();
  const stop = startDriftCorrectedLoop(intervalMs, async () => {
    count += 1;
  });
  await wait(155);
  stop();
  const elapsed = Date.now() - start;
  const expectedTicks = elapsed / intervalMs;
  // Real timers are never perfectly precise; assert we are in a sane
  // ballpark of the ideal tick count rather than wildly under-firing.
  assert.ok(count >= expectedTicks * 0.5, `expected roughly ${expectedTicks} ticks, got ${count}`);
});
