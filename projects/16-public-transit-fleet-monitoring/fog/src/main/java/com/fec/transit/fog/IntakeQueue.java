package com.fec.transit.fog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

/** Lock-free ConcurrentLinkedQueue.offer() per ingest with no shared map or per-key lock until drainAndGroup() flushes and groups by (sensor_type, site_id) -- the sixth distinct Java buffering shape in this portfolio. */
final class IntakeQueue {

    private final ConcurrentLinkedQueue<ReadingEvent> queue = new ConcurrentLinkedQueue<>();

    void ingest(ReadingEvent event) {
        queue.offer(event);
    }

    /** Drains the queue completely and groups the drained events by (sensor_type, site_id). */
    Map<GroupKey, List<ReadingEvent>> drainAndGroup() {
        Map<GroupKey, List<ReadingEvent>> grouped = new LinkedHashMap<>();
        ReadingEvent event;
        while ((event = queue.poll()) != null) {
            grouped.computeIfAbsent(new GroupKey(event.sensorType(), event.siteId()), k -> new ArrayList<>()).add(event);
        }
        return grouped;
    }
}
