package com.fec.retail.processor;

import java.util.ArrayList;
import java.util.List;

/**
 * Immutable running total of a batch's outcome, combined via Stream.reduce
 * rather than a mutable accumulator loop or Collectors.partitioningBy. Each
 * record produces its own single-element Tally (written(1) or failed(1,
 * reason)), and reduce() folds the whole batch down to one Tally with
 * plain-old immutable-record merging -- attempt-all-then-report-once, the
 * same semantics as 02/04/07 but expressed as a fold over immutable values
 * instead of a loop, a stream partition, or a mutable tally object.
 */
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
