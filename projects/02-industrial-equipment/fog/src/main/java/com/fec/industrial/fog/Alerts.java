package com.fec.industrial.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class Alerts {

    public record FaultRule(String field, String op, double limit, String key) {}

    // rotation_speed watches both min (stall) and max (overspin); the others only worsen as the reading climbs, so one avg rule each.
    public static final Map<String, List<FaultRule>> FAULT_RULES = Map.of(
        "vibration", List.of(new FaultRule("avg", ">", 7.0, "bearing_wear_risk")),
        "motor_temperature", List.of(new FaultRule("avg", ">", 95, "overheating")),
        "bearing_acoustic", List.of(new FaultRule("avg", ">", 85, "acoustic_anomaly")),
        "rotation_speed", List.of(
            new FaultRule("min", "<", 1000, "underspeed_fault"),
            new FaultRule("max", ">", 3400, "overspeed_fault")
        ),
        "power_draw", List.of(new FaultRule("avg", ">", 65, "power_spike"))
    );

    static double windowMetric(Aggregation.Summary summary, String field) {
        return switch (field) {
            case "avg" -> summary.avg();
            case "min" -> summary.min();
            case "max" -> summary.max();
            default -> throw new IllegalStateException("unknown field " + field);
        };
    }

    public static List<String> diagnoseFaults(String sensorType, Aggregation.Summary summary) {
        List<String> fired = new ArrayList<>();
        for (FaultRule rule : FAULT_RULES.getOrDefault(sensorType, List.of())) {
            double value = windowMetric(summary, rule.field());
            boolean triggered = rule.op().equals("<") ? value < rule.limit() : value > rule.limit();
            if (triggered) fired.add(rule.key());
        }
        return fired;
    }
}
