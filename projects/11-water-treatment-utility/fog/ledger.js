"use strict";

// Two-phase buffering. /ingest (in app.js) does nothing but validate a
// request and append one raw entry per reading onto a single flat array --
// there is no per-(sensor_type, site_id) Map and no folding/streaming math
// at ingest time at all, just a synchronous array push. Grouping by key and
// computing window aggregates both happen later, in one pass, only when the
// window-flush timer calls drainEntries() + groupByKey(). This is a genuine
// two-phase design (fast synchronous append now, aggregation entirely
// deferred to flush), distinct from:
//   - 03-patient-vitals: readings are pushed straight into a shared
//     per-key array-in-an-object, already grouped by key at ingest time.
//   - 06-offshore-wind-farm: each reading is folded into a live streaming
//     accumulator (openAccumulator/fold) the instant it arrives, so no raw
//     reading list is ever kept.
//   - 10-wildfire-forest-monitoring: an EventEmitter-dispatched listener
//     buffers into a Map keyed by sensor_type+site_id the moment the
//     "reading" event fires -- still grouped-by-key at ingest time, just
//     via pub/sub instead of a direct call.
// Here, nothing is grouped by key until flush. The ledger itself has no
// concept of sensor_type or site_id at all; it is just an ordered log.
function createLedger() {
  return { entries: [] };
}

function appendEntry(ledger, entry) {
  ledger.entries.push(entry);
}

function drainEntries(ledger) {
  const taken = ledger.entries;
  ledger.entries = [];
  return taken;
}

// Pure grouping function run once at flush time over the whole drained
// entry list, never incrementally maintained during ingest.
function groupByKey(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.sensorType}::${entry.siteId}`;
    if (!groups.has(key)) {
      groups.set(key, { sensorType: entry.sensorType, siteId: entry.siteId, unit: entry.unit, readings: [] });
    }
    groups.get(key).readings.push({ ts: entry.ts, value: entry.value });
  }
  return Array.from(groups.values());
}

module.exports = { createLedger, appendEntry, drainEntries, groupByKey };
