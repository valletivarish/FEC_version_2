package com.fec.retail.processor;

import java.util.ArrayList;
import java.util.List;

/** Immutable per-batch outcome (written count + failure reasons), folded together via Stream.reduce. */
record Tally(int written, List<String> failures) {

    static final Tally EMPTY = new Tally(0, List.of());

    static Tally success() {
        return new Tally(1, List.of());
    }

    static Tally failed(String reason) {
        return new Tally(0, List.of(reason));
    }

    Tally combine(Tally other) {
        if (other.failures.isEmpty() && this.failures.isEmpty()) {
            return new Tally(this.written + other.written, List.of());
        }
        List<String> merged = new ArrayList<>(this.failures);
        merged.addAll(other.failures);
        return new Tally(this.written + other.written, List.copyOf(merged));
    }

    boolean clean() {
        return failures.isEmpty();
    }
}
