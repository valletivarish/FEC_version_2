package com.fec.transit.fog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Buffers every incoming reading as a flat, independently-queued event
 * instead of mutating a per-(sensor_type, site_id) map at ingest time.
 * ingest() does exactly one lock-free ConcurrentLinkedQueue.offer() and
 * returns -- there is no shared map, no per-key lock, and no dedicated
 * worker thread anywhere in this class. Readings are only ever grouped by
 * key during the flush cycle, when drainAndGroup() polls the whole queue
 * empty and folds events into per-(sensor_type, site_id) buckets in one
 * single-threaded pass.
 *
 * This is the sixth distinct Java buffering shape used across this
 * portfolio: 02's FogApp wraps one shared HashMap in a single
 * synchronized(lock) block; 04's CityFogNode fences a
 * ConcurrentHashMap-of-generations with AtomicReference/AtomicInteger/
 * AtomicBoolean bookkeeping so a flush can retire a generation without
 * losing an in-flight write; 07's FleetGateway shards a ConcurrentHashMap
 * into per-key ReentrantLock-guarded BufferBucket objects; 08's BufferActor
 * hands every ingest to a single dedicated thread draining a
 * LinkedBlockingQueue mailbox; 09's PondGateway folds readings through
 * ConcurrentHashMap.merge() with an immutable ReadingAccumulator. None of
 * those keep a per-key structure this class deliberately avoids: there is no
 * map at all until a flush actually happens, so two ingests for the same
 * (sensor_type, site_id) never contend with each other, or with an ingest
 * for any other key -- they are just two independent queue.offer() calls.
 */
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
