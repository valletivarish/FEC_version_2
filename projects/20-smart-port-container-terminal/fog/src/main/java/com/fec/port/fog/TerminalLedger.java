package com.fec.port.fog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Buffers incoming readings in a single global ConcurrentSkipListMap<Long,
 * Entry>, keyed by a monotonically increasing AtomicLong sequence number
 * rather than by (sensor_type, site_id) -- every other Java fog sibling in
 * this portfolio keys its buffer BY GROUP first (a Map<Key,...> of some
 * kind, or in 16's case a flat but ungrouped ConcurrentLinkedQueue). Here
 * grouping only happens once, lazily, at drain time; the live structure
 * itself is a single sorted map ordered purely by arrival sequence.
 *
 * ingest() never locks and never CASes a whole map/generation reference: it
 * just calls ledger.put(sequence.getAndIncrement(), entry) once per
 * reading, which ConcurrentSkipListMap supports as a genuinely lock-free
 * concurrent operation. drainWindow() takes a snapshot boundary
 * (sequence.get()) and asks the map for the NavigableMap VIEW of every
 * entry strictly before that boundary (headMap(boundary, false)) -- a
 * standard SortedMap view, backed live by the same map -- then calls
 * clear() on that VIEW, which removes exactly those entries from the
 * backing ledger. Readings ingested concurrently during the drain get a
 * sequence number >= boundary, so they fall outside the view and are left
 * untouched for the next window; there is no need to swap in a fresh map,
 * fence in-flight writers, or hand off through a queue.
 */
public class TerminalLedger {

    private record Entry(GroupKey key, String unit, Reading reading) {}

    /** One group's readings plus the unit last reported for that group in this window. */
    public record WindowBatch(String unit, List<Reading> readings) {}

    private final ConcurrentSkipListMap<Long, Entry> ledger = new ConcurrentSkipListMap<>();
    private final AtomicLong sequence = new AtomicLong();

    public void ingest(String sensorType, String siteId, String unit, List<Reading> readings) {
        GroupKey key = new GroupKey(sensorType, siteId);
        for (Reading reading : readings) {
            ledger.put(sequence.getAndIncrement(), new Entry(key, unit, reading));
        }
    }

    public Map<GroupKey, WindowBatch> drainWindow() {
        long boundary = sequence.get();
        NavigableMap<Long, Entry> due = ledger.headMap(boundary, false);

        Map<GroupKey, List<Reading>> readingsByKey = new LinkedHashMap<>();
        Map<GroupKey, String> unitByKey = new LinkedHashMap<>();
        for (Entry entry : due.values()) {
            readingsByKey.computeIfAbsent(entry.key(), k -> new ArrayList<>()).add(entry.reading());
            unitByKey.put(entry.key(), entry.unit());
        }
        due.clear(); // removes exactly the entries this view covers from the backing ledger

        Map<GroupKey, WindowBatch> result = new LinkedHashMap<>();
        for (Map.Entry<GroupKey, List<Reading>> e : readingsByKey.entrySet()) {
            result.put(e.getKey(), new WindowBatch(unitByKey.get(e.getKey()), e.getValue()));
        }
        return result;
    }
}
