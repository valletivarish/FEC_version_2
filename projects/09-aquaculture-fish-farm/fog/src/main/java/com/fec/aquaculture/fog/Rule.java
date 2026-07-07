package com.fec.aquaculture.fog;

import java.util.function.BiPredicate;

/**
 * A single threshold rule, built through a small fluent DSL rather than an
 * enum constant, a sealed-interface record variant, or a declarative-plus-
 * switch pair: Rule.on("dissolved_oxygen_mgl").when(Field.AVG).lessThan(4.0)
 * .flagAs("hypoxia_risk"). Each call in the chain returns a narrower builder
 * stage, so a caller can't produce a Rule missing a comparison or a key --
 * the only way to finish the chain is through flagAs(). The finished Rule is
 * an immutable record holding a BiPredicate<String, WindowAggregate> (the
 * sensor-type match plus the actual comparison, closed over at build time)
 * alongside plain metadata for the /thresholds endpoint. This differs from
 * 02's Map<String,List<Rule>> + field-name switch, 04's RULE_CATALOG map
 * plus a separate hardcoded switch-expression assess(), 07's sealed
 * AboveLimit/BelowLimit record variants with polymorphic firesOn(), and 08's
 * enum AlertRule implementing Predicate<WindowAggregate> with per-constant
 * bodies -- here rules are assembled once at class-init time via static
 * factory chains into a plain List<Rule>, read top-to-bottom as a sentence.
 */
record Rule(String sensorType, String field, String op, double limit, String key,
            BiPredicate<String, WindowAggregate> test) {

    boolean firesOn(String sensorType, WindowAggregate window) {
        return test.test(sensorType, window);
    }

    static SensorStage on(String sensorType) {
        return new SensorStage(sensorType);
    }

    record SensorStage(String sensorType) {
        FieldStage when(Field field) {
            return new FieldStage(sensorType, field);
        }
    }

    record FieldStage(String sensorType, Field field) {
        ComparisonStage lessThan(double limit) {
            return new ComparisonStage(sensorType, field, "<", limit,
                (type, window) -> type.equals(sensorType) && field.applyAsDouble(window) < limit);
        }

        ComparisonStage greaterThan(double limit) {
            return new ComparisonStage(sensorType, field, ">", limit,
                (type, window) -> type.equals(sensorType) && field.applyAsDouble(window) > limit);
        }
    }

    record ComparisonStage(String sensorType, Field field, String op, double limit,
                            BiPredicate<String, WindowAggregate> test) {
        Rule flagAs(String key) {
            return new Rule(sensorType, field.label(), op, limit, key, test);
        }
    }
}
