package com.fec.warehouse.fog;

import java.util.function.ToDoubleFunction;

/**
 * A threshold rule bound to a specific aggregate field (avg/min/max) and a
 * comparison direction. Each variant knows both how to evaluate itself
 * against a window and how to describe itself for the /thresholds endpoint.
 */
public sealed interface AlertRule permits AlertRule.AboveLimit, AlertRule.BelowLimit {

    String key();

    boolean firesOn(WindowAggregate window);

    String field();

    String op();

    double limit();

    ToDoubleFunction<WindowAggregate> AVG = WindowAggregate::avg;
    ToDoubleFunction<WindowAggregate> MIN = WindowAggregate::min;
    ToDoubleFunction<WindowAggregate> MAX = WindowAggregate::max;

    record AboveLimit(String fieldName, ToDoubleFunction<WindowAggregate> extractor, double limit, String key) implements AlertRule {
        @Override
        public boolean firesOn(WindowAggregate window) {
            return extractor.applyAsDouble(window) > limit;
        }

        @Override
        public String field() {
            return fieldName;
        }

        @Override
        public String op() {
            return ">";
        }
    }

    record BelowLimit(String fieldName, ToDoubleFunction<WindowAggregate> extractor, double limit, String key) implements AlertRule {
        @Override
        public boolean firesOn(WindowAggregate window) {
            return extractor.applyAsDouble(window) < limit;
        }

        @Override
        public String field() {
            return fieldName;
        }

        @Override
        public String op() {
            return "<";
        }
    }

    static AlertRule above(String fieldName, ToDoubleFunction<WindowAggregate> field, double limit, String key) {
        return new AboveLimit(fieldName, field, limit, key);
    }

    static AlertRule below(String fieldName, ToDoubleFunction<WindowAggregate> field, double limit, String key) {
        return new BelowLimit(fieldName, field, limit, key);
    }
}
