package com.fec.retail.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/** Each enum constant is a rule carrying its watched sensor type, /thresholds metadata, and its own firing predicate. */
public enum AlertRule implements Predicate<WindowAggregate> {

    RESTOCK_NEEDED("shelf_stock_pct", "avg", "<", 15) {
        @Override
        public boolean test(WindowAggregate window) {
            return window.avg() < 15;
        }
    },
    COLD_CHAIN_RISK("fridge_temp_c", "avg", ">", 8) {
        @Override
        public boolean test(WindowAggregate window) {
            return window.avg() > 8;
        }
    },
    CHECKOUT_CONGESTION("queue_length", "avg", ">", 12) {
        @Override
        public boolean test(WindowAggregate window) {
            return window.avg() > 12;
        }
    },
    CAPACITY_WARNING("footfall_count", "avg", ">", 500) {
        @Override
        public boolean test(WindowAggregate window) {
            return window.avg() > 500;
        }
    };

    private final String sensorType;
    private final String field;
    private final String op;
    private final double limit;

    AlertRule(String sensorType, String field, String op, double limit) {
        this.sensorType = sensorType;
        this.field = field;
        this.op = op;
        this.limit = limit;
    }

    public String sensorType() {
        return sensorType;
    }

    public String field() {
        return field;
    }

    public String op() {
        return op;
    }

    public double limit() {
        return limit;
    }

    /** Key used in the fired-alerts list, e.g. "restock_needed". */
    public String key() {
        return name().toLowerCase();
    }

    /** All rules that watch a given sensor type, in declaration order. */
    static List<AlertRule> forSensorType(String sensorType) {
        List<AlertRule> matches = new ArrayList<>();
        for (AlertRule rule : values()) {
            if (rule.sensorType.equals(sensorType)) matches.add(rule);
        }
        return matches;
    }

    /** Evaluates every rule registered for this window's sensor type. */
    public static List<String> evaluate(WindowAggregate window) {
        List<String> fired = new ArrayList<>();
        for (AlertRule rule : forSensorType(window.sensorType())) {
            if (rule.test(window)) fired.add(rule.key());
        }
        return fired;
    }
}
