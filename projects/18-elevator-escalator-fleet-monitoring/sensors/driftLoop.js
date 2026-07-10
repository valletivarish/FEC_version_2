"use strict";

// Drift-corrected self-adjusting setTimeout loop. Every other Node sensor in
// this portfolio schedules its recurring work with a plain fixed-delay timer
// (03-patient-vitals and 06-offshore-wind-farm use one flat setInterval;
// 10-wildfire-forest-monitoring uses two independent recursive setTimeout
// loops, one for sampling and one for dispatch; 11-water-treatment-utility
// uses a plain setInterval for sampling and a separate recursive
// setImmediate loop -- not setTimeout -- for opportunistic dispatch). None
// of those measure real wall-clock time, so any jitter -- event-loop
// contention, a slow fetch(), GC pauses -- just accumulates tick over tick:
// after 1000 ticks of "roughly 2s" you can be many seconds behind where a
// true 2s cadence would put you.
//
// startDriftCorrectedLoop instead anchors a loopStart timestamp taken with
// process.hrtime() (a monotonic clock, immune to system clock adjustments)
// once, up front. After every tick it re-measures actual elapsed time
// against that anchor with process.hrtime(loopStart) and computes the delay
// to the *next* ideal tick boundary (tickCount * intervalMs from the
// anchor), not simply "intervalMs from now". A tick that ran long borrows
// time from its own next delay instead of pushing every future tick later
// by the same amount, so the loop's average rate converges on intervalMs
// even under variable per-tick latency.
function startDriftCorrectedLoop(intervalMs, tickFn) {
  let stopped = false;
  let timer = null;
  let tickCount = 0;
  const loopStart = process.hrtime();

  function elapsedMs() {
    const [seconds, nanoseconds] = process.hrtime(loopStart);
    return seconds * 1000 + nanoseconds / 1e6;
  }

  async function runTick() {
    if (stopped) return;
    tickCount += 1;
    try {
      await tickFn();
    } finally {
      if (!stopped) {
        const nextBoundary = (tickCount + 1) * intervalMs;
        const delay = Math.max(0, nextBoundary - elapsedMs());
        timer = setTimeout(runTick, delay);
      }
    }
  }

  timer = setTimeout(runTick, intervalMs);

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = { startDriftCorrectedLoop };
