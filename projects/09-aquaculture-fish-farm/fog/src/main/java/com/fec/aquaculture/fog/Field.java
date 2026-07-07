package com.fec.aquaculture.fog;

import java.util.function.ToDoubleFunction;

/** Which aggregate field a Rule reads from a WindowAggregate -- shared by the fluent Rule DSL below. */
enum Field implements ToDoubleFunction<WindowAggregate> {
    AVG(WindowAggregate::avg),
    MIN(WindowAggregate::min),
    MAX(WindowAggregate::max);

    private final ToDoubleFunction<WindowAggregate> extractor;

    Field(ToDoubleFunction<WindowAggregate> extractor) {
        this.extractor = extractor;
    }

    @Override
    public double applyAsDouble(WindowAggregate window) {
        return extractor.applyAsDouble(window);
    }

    String label() {
        return name().toLowerCase();
    }
}
