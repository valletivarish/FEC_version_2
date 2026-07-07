package com.fec.aquaculture.processor;

import java.util.ArrayList;
import java.util.List;

/** Immutable outcome of a batch: how many records wrote successfully, plus every failure reason. */
record Tally(int written, List<String> failures) {

    static final Tally EMPTY = new Tally(0, List.of());

    static Tally success() {
        return new Tally(1, List.of());
    }

    static Tally failed(String reason) {
        return new Tally(0, List.of(reason));
    }

    Tally combine(Tally other) {
        List<String> merged = new ArrayList<>(failures.size() + other.failures.size());
        merged.addAll(failures);
        merged.addAll(other.failures);
        return new Tally(written + other.written, List.copyOf(merged));
    }

    boolean clean() {
        return failures.isEmpty();
    }
}
