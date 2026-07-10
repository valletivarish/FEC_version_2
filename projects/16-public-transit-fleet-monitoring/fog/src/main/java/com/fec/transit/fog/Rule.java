package com.fec.transit.fog;

import java.util.function.Predicate;

/**
 * One threshold rule: plain field/op/limit/key metadata (surfaced verbatim
 * via /thresholds) plus a Predicate&lt;WindowAggregate&gt; closed over that
 * same limit at construction time. Built once through a handful of static
 * factories (avgAbove/avgBelow/maxAbove) and kept as a flat List&lt;Rule&gt;
 * evaluated with a stream pipeline in TransitAlerts.
 *
 * This is the sixth distinct alert-rule idiom used across this portfolio's
 * Java projects: 02's Alerts and 04's IncidentRules both represent rules as
 * declarative Map/List metadata evaluated through a separate switch (04
 * keeps its switch's cases hand-duplicated from the declarative table rather
 * than data-driven); 07's AlertRule is a sealed interface with
 * AboveLimit/BelowLimit record variants evaluated polymorphically; 08's
 * AlertRule is an enum implementing Predicate&lt;WindowAggregate&gt; with a
 * per-constant overridden body; 09's Rule is assembled through a multi-stage
 * fluent builder DSL (SensorStage -&gt; FieldStage -&gt; ComparisonStage)
 * evaluated with a plain for-loop. Here a single flat record type carries
 * its own Predicate field, and TransitAlerts.evaluate() reads as one stream
 * pipeline (filter by sensor type, filter by the predicate, map to the fired
 * key) instead of a loop or a switch.
 */
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
