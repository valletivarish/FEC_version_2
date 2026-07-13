package com.fec.mining.fog;

/** Holds no functional field (no Predicate/lambda) -- HazardRules does the greater-than comparison itself via a plain switch on AggregateField, and unlike 04's similarly declarative RuleDescription, this record's CATALOG list is what assess() actually iterates and evaluates. */
public record ThresholdRule(String sensorType, AggregateField field, double limit, String alertKey) {}
