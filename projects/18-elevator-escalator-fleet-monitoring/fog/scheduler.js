"use strict";

// Self-recursing async Promise chain: each cycle dwells, flushes, then re-arms itself.
function dwell(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startDispatchCycle(windowSeconds, onFlush) {
  let stopped = false;

  async function tick() {
    await dwell(windowSeconds * 1000);
    if (stopped) return;
    try {
      await onFlush();
    } catch (err) {
      console.log(`window flush error: ${err.message}`);
    }
    if (stopped) return;
    return tick();
  }

  const chain = tick();
  chain.catch((err) => console.log(`window loop terminated unexpectedly: ${err.message}`));

  return function stop() {
    stopped = true;
  };
}

module.exports = { startDispatchCycle, dwell };
