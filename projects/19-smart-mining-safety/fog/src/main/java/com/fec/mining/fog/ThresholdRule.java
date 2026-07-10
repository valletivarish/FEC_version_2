package com.fec.mining.fog;

/**
 * A single safety threshold: sensorType's AggregateField must exceed limit
 * for alertKey to fire.
 *
 * Deliberately holds no functional field -- no Predicate/BiPredicate/
 * ToDoubleFunction/lambda anywhere on this record, unlike 07's sealed
 * AlertRule interface (AboveLimit/BelowLimit records each holding a
 * ToDoubleFunction extractor), 08's enum AlertRule implementing
 * Predicate<WindowAggregate> with a per-constant overridden test(), 09's
 * Rule built through a fluent DSL (Rule.on(...).when(Field.AVG).lessThan(...))
 * that stores a BiPredicate, or 16's Rule with static factories
 * (avgAbove/avgBelow/maxAbove) that each close over a Predicate. HazardRules
 * reads field/limit off this record and performs the comparison itself in a
 * plain switch -- closer in spirit to 02's raw "field"/"op" strings, but
 * with a typed AggregateField enum instead of a raw string, and with no "op"
 * field at all, since every real rule in this domain is a strict
 * greater-than comparison. 04 is the only sibling with a comparably
 * "no functional field" rule shape (RuleDescription), but 04's is purely
 * declarative metadata that assess() ignores entirely in favour of a
 * hardcoded per-metric switch -- here the CATALOG list IS what
 * HazardRules.assess() actually iterates and evaluates.
 */
public record ThresholdRule(String sensorType, AggregateField field, double limit, String alertKey) {}
