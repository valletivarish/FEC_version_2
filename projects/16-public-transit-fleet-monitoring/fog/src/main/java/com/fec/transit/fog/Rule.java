package com.fec.transit.fog;

import java.util.function.Predicate;

/** Flat record carrying its own Predicate&lt;WindowAggregate&gt; field, evaluated via a stream pipeline in TransitAlerts - the sixth distinct alert-rule idiom in this portfolio's Java projects. */
record Rule(String sensorType, String field, String op, double limit, String key, Predicate<WindowAggregate> test) {

    static Rule avgAbove(String sensorType, double limit, String key) {
        return new Rule(sensorType, "avg", ">", limit, key, w -> w.avg() > limit);
    }

    static Rule avgBelow(String sensorType, double limit, String key) {
        return new Rule(sensorType, "avg", "<", limit, key, w -> w.avg() < limit);
    }

    static Rule maxAbove(String sensorType, double limit, String key) {
        return new Rule(sensorType, "max", ">", limit, key, w -> w.max() > limit);
    }
}
