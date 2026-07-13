package com.fec.port.fog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.atomic.AtomicLong;

/** Lock-free buffer keyed by a monotonically increasing AtomicLong sequence in a single ConcurrentSkipListMap (not pre-grouped by sensor/site like sibling fogs); drainWindow() snapshots the boundary and calls headMap(boundary, false).clear() to atomically remove only entries before it. */
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
