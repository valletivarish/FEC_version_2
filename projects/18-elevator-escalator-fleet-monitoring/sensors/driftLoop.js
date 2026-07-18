"use strict";

// Drift-corrected setTimeout loop: schedules each tick against the next ideal boundary (tickCount * intervalMs) so jitter cannot accumulate.
function startCadenceLoop(intervalMs, tickFn) {
  let stopped = false;
  let timer = null;
  let tickCount = 0;
  const cadenceOrigin = process.hrtime();

  function elapsedMs() {
    const [seconds, nanoseconds] = process.hrtime(cadenceOrigin);
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

module.exports = { startCadenceLoop };
