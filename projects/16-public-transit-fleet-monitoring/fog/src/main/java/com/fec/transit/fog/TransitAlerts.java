package com.fec.transit.fog;

import java.util.List;

/**
 * The real transit fleet threshold rules, evaluated on each window's
 * aggregate. gps_speed_kmh deliberately has no rule -- it is still ingested,
 * windowed, and shown on the dashboard as a secondary detail, it just never
 * fires an alert.
 */
public class TransitAlerts {

    static final List<Rule> RULES = List.of(
        Rule.avgAbove("engine_temp_c", 105, "engine_overheat_risk"),
        Rule.avgAbove("brake_pad_wear_pct", 80, "brake_service_required"),
        Rule.avgBelow("fuel_level_pct", 15, "low_fuel_warning"),
        Rule.maxAbove("passenger_count", 75, "overcrowding_alert")
    );

    public static List<String> evaluate(String sensorType, WindowAggregate window) {
        return RULES.stream()
            .filter(rule -> rule.sensorType().equals(sensorType))
            .filter(rule -> rule.test().test(window))
            .map(Rule::key)
            .toList();
    }

    static List<Rule> forSensorType(String sensorType) {
        return RULES.stream().filter(rule -> rule.sensorType().equals(sensorType)).toList();
    }
}
