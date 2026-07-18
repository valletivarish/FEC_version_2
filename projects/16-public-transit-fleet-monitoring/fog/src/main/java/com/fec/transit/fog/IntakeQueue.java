package com.fec.transit.fog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

/** Lock-free ConcurrentLinkedQueue.offer() per reading, with no shared map or per-key lock until drainByGroup() flushes and groups by (sensor_type, site_id). */
final class IntakeQueue {

    private final ConcurrentLinkedQueue<ReadingEvent> pending = new ConcurrentLinkedQueue<>();

    void enqueue(ReadingEvent event) {
        pending.offer(event);
    }

    /** Drains the queue completely and groups the drained events by (sensor_type, site_id). */
    Map<GroupKey, List<ReadingEvent>> drainByGroup() {
        Map<GroupKey, List<ReadingEvent>> buckets = new LinkedHashMap<>();
        ReadingEvent event;
        while ((event = pending.poll()) != null) {
            buckets.computeIfAbsent(new GroupKey(event.sensorType(), event.siteId()), k -> new ArrayList<>()).add(event);
        }
        return buckets;
    }
}
