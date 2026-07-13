"use strict";

// Self-recursing async Promise chain (tick awaits sleep+onFlush then calls itself) instead of a re-armed setInterval/setTimeout -- unlike siblings 03/06/10/11.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startWindowLoop(windowSeconds, onFlush) {
  let stopped = false;

  async function tick() {
    await sleep(windowSeconds * 1000);
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

module.exports = { startWindowLoop, sleep };
