package com.fec.aquaculture.fog;

import java.util.ArrayList;
import java.util.List;

/**
 * Immutable running accumulation of one buffer bucket's values. Every mutation
 * produces a brand new instance rather than touching shared state -- the class
 * itself owns no lock, no atomic field, and no dedicated thread. Concurrency
 * safety comes entirely from ConcurrentHashMap.merge()'s own guarantee that
 * the remapping function for a given key runs atomically (effectively
 * synchronized per-bucket internally), so combine() only ever needs to be a
 * pure function of two immutable accumulators. This is deliberately different
 * from every other Java sibling in this portfolio: 02 wraps a shared HashMap
 * in an explicit synchronized(lock), 04 layers AtomicReference/AtomicInteger/
 * AtomicBoolean fencing on top of a ConcurrentHashMap, 07 gives each
 * ConcurrentHashMap bucket its own ReentrantLock, and 08 removes the map
 * entirely in favour of a single actor thread draining a queue. Here the map
 * is the only synchronization primitive in play.
 */
final class ReadingAccumulator {

    private final List<Double> values;
    private final String unit;

    private ReadingAccumulator(List<Double> values, String unit) {
        this.values = values;
        this.unit = unit;
    }

    static ReadingAccumulator of(List<Double> incoming, String unit) {
        return new ReadingAccumulator(List.copyOf(incoming), unit == null ? "" : unit);
    }

    /**
     * Pure merge of two accumulators, passed as the remapping function to
     * Map.merge(key, incoming, ReadingAccumulator::combine). Never mutates
     * either argument; always returns a fresh immutable instance.
     */
    ReadingAccumulator combine(ReadingAccumulator other) {
        List<Double> merged = new ArrayList<>(values.size() + other.values.size());
        merged.addAll(values);
        merged.addAll(other.values);
        // A later-arriving batch's unit label wins only when the earlier one
        // never carried one -- units don't change mid-flight in practice, but
        // an empty placeholder should not stomp a real one already recorded.
        String resolvedUnit = unit.isEmpty() ? other.unit : unit;
        return new ReadingAccumulator(List.copyOf(merged), resolvedUnit);
    }

    List<Double> values() {
        return values;
    }

    String unit() {
        return unit;
    }
}
