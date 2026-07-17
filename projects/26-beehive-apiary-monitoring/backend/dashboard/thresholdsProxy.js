"use strict";

async function relayAlertRules(fogThresholdsUrl) {
  try {
    const upstream = await fetch(fogThresholdsUrl, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) return { ok: false, status: 502, body: { error: "thresholds unavailable" } };
    return { ok: true, status: 200, body: await upstream.json() };
  } catch {
    return { ok: false, status: 502, body: { error: "thresholds unavailable" } };
  }
}

module.exports = { relayAlertRules };
