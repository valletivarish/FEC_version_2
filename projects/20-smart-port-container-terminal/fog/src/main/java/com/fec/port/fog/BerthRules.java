package com.fec.port.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.BiPredicate;
import java.util.function.ToDoubleFunction;

/** assess() dispatches via two static lookup maps (FIELD_EXTRACTORS, COMPARATORS) rather than a switch/enum/lambda-per-rule idiom, unlike this portfolio's other Java fog siblings (02, 04, 07, 08, 09, 16, 19). */
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
