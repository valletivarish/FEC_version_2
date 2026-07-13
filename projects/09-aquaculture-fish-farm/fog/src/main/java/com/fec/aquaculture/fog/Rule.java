package com.fec.aquaculture.fog;

import java.util.function.BiPredicate;

/** A fluent builder DSL (on().when().lessThan().flagAs()) whose narrowing stage types make an incomplete Rule unrepresentable -- the 9th distinct rule-representation idiom in this portfolio. */
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
