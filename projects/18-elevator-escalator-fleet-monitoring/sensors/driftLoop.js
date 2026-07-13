"use strict";

// Drift-corrected setTimeout loop -- anchors a monotonic process.hrtime() start and schedules each tick against the next ideal boundary (tickCount * intervalMs) instead of a fixed delay-from-now, so per-tick jitter can't accumulate the way it does in this portfolio's plain setInterval/setTimeout sensors.
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
