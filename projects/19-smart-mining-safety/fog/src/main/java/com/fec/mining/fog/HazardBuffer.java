package com.fec.mining.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

// Lock-free per-key ConcurrentLinkedQueue buffer with atomic per-key detach via ConcurrentHashMap.computeIfPresent.
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

    // Atomically detaches and removes the entire queue for one key, in arrival order.
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
