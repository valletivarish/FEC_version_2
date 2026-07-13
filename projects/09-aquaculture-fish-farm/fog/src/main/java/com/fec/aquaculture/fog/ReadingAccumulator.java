package com.fec.aquaculture.fog;

import java.util.ArrayList;
import java.util.List;

// Immutable accumulator combined solely via ConcurrentHashMap.merge()'s per-key atomicity guarantee -- no locks, atomics, or dedicated thread, unlike this portfolio's other Java fog buffering siblings.
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
