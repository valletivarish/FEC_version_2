package com.fec.port.fog;

/**
 * One threshold rule as PURE data -- sensor_type, which aggregate field to
 * read, which comparison operator, the limit, and the alert key to raise.
 * This record carries no functional/lambda field of any kind (no Predicate,
 * BiPredicate, ToDoubleFunction, or embedded test() method) and there is no
 * enum, sealed interface or polymorphic dispatch anywhere near it -- see
 * BerthRules for how a rule like this actually gets interpreted.
 */
public record ThresholdRule(String sensorType, String field, String op, double limit, String key) {}
