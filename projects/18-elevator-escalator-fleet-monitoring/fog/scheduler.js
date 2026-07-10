"use strict";

// The flush cycle is a genuine recursive async Promise chain, not a timer
// callback. sleep() wraps setTimeout in a Promise; tick() awaits that sleep,
// then awaits onFlush() (which snapshots+clears the window buffer), then --
// instead of returning to an outer setInterval/setTimeout re-arm site --
// calls itself again and returns that call's Promise. Every recurrence is a
// fresh stack frame produced by awaiting the previous one, so the "loop" is
// really an ever-growing (but never deeply nested, thanks to the awaits
// unwinding each frame before the next begins) chain of Promise
// continuations. This is a distinct scheduling idiom from every sibling
// fog service in this portfolio, all of which re-arm a timer from inside a
// timer callback (a plain setInterval in every one of 03/06/10/11).
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
