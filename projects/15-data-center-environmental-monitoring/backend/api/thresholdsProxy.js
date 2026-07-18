"use strict";

// Kept as its own tiny function taking the upstream URL as a plain
// parameter, so it is directly unit-testable (success + unreachable-
// upstream) without spinning up API Gateway, Lambda, or the fog server.
// The /api/thresholds proxy lives in this Lambda (backend/api/) rather
// than backend/dashboard/, because the dashboard in this project does not
// implement any /api/* logic itself; it only reverse-proxies to API
// Gateway (see backend/dashboard/server.js).
async function fetchThresholds(fogThresholdsUrl) {
  try {
    const upstream = await fetch(fogThresholdsUrl, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) return { ok: false, status: 502, body: { error: "thresholds unavailable" } };
    return { ok: true, status: 200, body: await upstream.json() };
  } catch {
    return { ok: false, status: 502, body: { error: "thresholds unavailable" } };
  }
}

module.exports = { fetchThresholds };
