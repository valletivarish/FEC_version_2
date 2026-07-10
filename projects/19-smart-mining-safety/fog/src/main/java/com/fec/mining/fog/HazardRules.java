package com.fec.mining.fog;

import java.util.ArrayList;
import java.util.List;

/** The real, code-defined safety thresholds for this mine. Also exposed (descriptively) via GET /thresholds. */
public class HazardRules {

    public static final List<ThresholdRule> CATALOG = List.of(
        new ThresholdRule("methane_ppm", AggregateField.AVG, 1000, "methane_buildup_risk"),
        new ThresholdRule("co_ppm", AggregateField.AVG, 50, "co_exposure_risk"),
        new ThresholdRule("dust_concentration_mgm3", AggregateField.AVG, 10, "silica_dust_hazard"),
        new ThresholdRule("ground_vibration_mms", AggregateField.MAX, 25, "blast_vibration_exceedance")
        // ambient_temp_c intentionally carries no rule: one of the 5 required
        // sensor types, shown on the dashboard, but never raises an alert.
    );

    static double valueOf(AggregateField field, WindowAggregate window) {
        return switch (field) {
            case AVG -> window.avg();
            case MAX -> window.max();
        };
    }

    public static List<String> assess(String sensorType, WindowAggregate window) {
        List<String> fired = new ArrayList<>();
        for (ThresholdRule rule : CATALOG) {
            if (!rule.sensorType().equals(sensorType)) continue;
            if (valueOf(rule.field(), window) > rule.limit()) fired.add(rule.alertKey());
        }
        return fired;
    }
}
