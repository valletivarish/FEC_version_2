"use strict";

// Kept as its own tiny function taking the upstream URL as a plain
// parameter, rather than being inlined inside a route handler that reaches
// into a module-load-time-captured env var several calls deep. That makes
// it directly unit-testable (success + unreachable-upstream) without
// spinning up the whole server or mutating process.env.
async function fetchGatewayThresholds(fogThresholdsUrl) {
  try {
    const upstream = await fetch(fogThresholdsUrl, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) return { ok: false, status: 502, body: { error: "thresholds unavailable" } };
    return { ok: true, status: 200, body: await upstream.json() };
  } catch {
    return { ok: false, status: 502, body: { error: "thresholds unavailable" } };
  }
}

module.exports = { fetchGatewayThresholds };
