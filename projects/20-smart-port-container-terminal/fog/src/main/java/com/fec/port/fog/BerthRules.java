package com.fec.port.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.BiPredicate;
import java.util.function.ToDoubleFunction;

/**
 * The real, code-defined safety/operational thresholds for this terminal.
 * Also exposed (descriptively) via GET /thresholds.
 *
 * assess() is a small GENERIC INTERPRETER over two static lookup tables --
 * FIELD_EXTRACTORS (turns a rule's "field" string into the actual aggregate
 * value to test) and COMPARATORS (turns a rule's "op" string into the actual
 * comparison) -- rather than a switch, an if-chain, an enum with per-
 * constant bodies, or a rule object that itself carries a lambda. No other
 * Java fog sibling in this portfolio dispatches this way: 02's Alerts
 * switches on the field name directly inside evaluate() and falls back to a
 * ternary for the operator; 04's assess() hardcodes a separate switch
 * expression per metric and never reads its own rule objects at all; 07's
 * AlertRule is a sealed interface whose record variants each embed a
 * ToDoubleFunction extractor and override firesOn(); 08's AlertRule is an
 * enum where each constant overrides its own test(); 09's Rule is built by a
 * fluent DSL that closes over a BiPredicate; 16's Rule embeds a Predicate
 * built by static factory methods; 19's ThresholdRule/HazardRules pairs a
 * typed 2-value enum selector with a switch expression. Here the rule
 * objects are inert data and BOTH steps of interpreting them -- which field,
 * which comparison -- are table lookups, so adding a new field or operator
 * never touches assess() itself, only the two maps below.
 */
public class BerthRules {

    static final Map<String, ToDoubleFunction<WindowAggregate>> FIELD_EXTRACTORS = Map.of(
        "avg", WindowAggregate::avg,
        "max", WindowAggregate::max,
        "min", WindowAggregate::min
    );

    static final Map<String, BiPredicate<Double, Double>> COMPARATORS = Map.of(
        ">", (actual, limit) -> actual > limit,
        "<", (actual, limit) -> actual < limit
    );

    public static final List<ThresholdRule> CATALOG = List.of(
        new ThresholdRule("crane_load_kg", "avg", ">", 32000, "crane_overload_risk"),
        new ThresholdRule("wind_speed_knots", "avg", ">", 34, "high_wind_crane_halt"),
        new ThresholdRule("berth_occupancy_pct", "avg", ">", 90, "berth_congestion_warning"),
        new ThresholdRule("reefer_temp_c", "avg", ">", -10, "reefer_temp_breach")
        // container_stack_height intentionally carries no rule: one of the 5
        // required sensor types, shown on the dashboard, but never alerts.
    );

    public static List<String> assess(String sensorType, WindowAggregate window) {
        List<String> fired = new ArrayList<>();
        for (ThresholdRule rule : CATALOG) {
            if (!rule.sensorType().equals(sensorType)) continue;
            double actual = FIELD_EXTRACTORS.get(rule.field()).applyAsDouble(window);
            if (COMPARATORS.get(rule.op()).test(actual, rule.limit())) {
                fired.add(rule.key());
            }
        }
        return fired;
    }
}
