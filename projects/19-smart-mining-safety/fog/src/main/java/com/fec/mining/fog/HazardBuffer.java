package com.fec.mining.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Pending-reading buffer for one flush window.
 *
 * Every other Java fog sibling in this portfolio guards its buffer with
 * either a single lock (02's FogApp.lock + synchronized blocks), a custom
 * generation/AtomicReference fencing scheme with per-generation
 * AtomicInteger/AtomicBoolean bookkeeping (04's CityFogNode.Generation), a
 * ConcurrentHashMap of buckets each guarded by its OWN ReentrantLock (07's
 * FleetGateway/BufferBucket), a single dedicated worker Thread draining a
 * BlockingQueue mailbox with no locks at all (08's BufferActor), an
 * immutable-value ConcurrentHashMap.merge() with a whole-map reference swap
 * at flush (09's PondGateway/ReadingAccumulator), or a flat
 * ConcurrentLinkedQueue of individual events grouped only at flush time
 * (16's IntakeQueue).
 *
 * This buffer uses none of those. Readings for a given (sensor_type,
 * site_id) key land in their own lock-free ConcurrentLinkedQueue, created
 * on first use via ConcurrentHashMap.computeIfAbsent(). A flush atomically
 * detaches one key's queue at a time via computeIfPresent(), whose
 * remapping function ConcurrentHashMap guarantees runs atomically per key
 * (concurrent compute-family calls for the SAME key from other threads
 * block until it completes; calls for a DIFFERENT key are unaffected).
 * There is no explicit lock, no AtomicReference swap, and no dedicated
 * worker thread anywhere in this class -- correctness rests entirely on
 * ConcurrentHashMap's documented per-key atomicity plus
 * ConcurrentLinkedQueue being safe for concurrent offer()/poll().
 */
public class HazardBuffer {

    private final ConcurrentHashMap<ShaftKey, ConcurrentLinkedQueue<Reading>> buffers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> units = new ConcurrentHashMap<>();

    public void ingest(String sensorType, String siteId, String unit, List<Reading> readings) {
        ShaftKey key = new ShaftKey(sensorType, siteId);
        buffers.computeIfAbsent(key, k -> new ConcurrentLinkedQueue<>()).addAll(readings);
        if (unit != null && !unit.isEmpty()) units.put(sensorType, unit);
    }

    /** Every key currently holding at least one reading, as of this call -- not itself a drain. */
    public Set<ShaftKey> activeKeys() {
        return Set.copyOf(buffers.keySet());
    }

    /**
     * Atomically detaches and removes the entire queue for one key, returning
     * its contents in arrival order. A concurrent ingest() for a DIFFERENT
     * key is untouched; a concurrent ingest() for the SAME key either
     * completes fully before or fully after this call, never interleaved,
     * and lands in a freshly created queue afterwards -- no reading is ever
     * silently dropped or double-counted.
     */
    public List<Reading> drain(ShaftKey key) {
        List<Reading> drained = new ArrayList<>();
        buffers.computeIfPresent(key, (k, queue) -> {
            Reading r;
            while ((r = queue.poll()) != null) drained.add(r);
            return null; // returning null from compute-family removes the mapping
        });
        return drained;
    }

    public String unitFor(String sensorType) {
        return units.getOrDefault(sensorType, "");
    }
}
