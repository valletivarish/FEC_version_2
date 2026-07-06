package com.fec.industrial.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class Alerts {

    public record Rule(String field, String op, double limit, String key) {}

    public static final Map<String, List<Rule>> THRESHOLDS = Map.of(
        "vibration", List.of(new Rule("avg", ">", 7.0, "bearing_wear_risk")),
        "motor_temperature", List.of(new Rule("avg", ">", 95, "overheating")),
        "bearing_acoustic", List.of(new Rule("avg", ">", 85, "acoustic_anomaly")),
        "rotation_speed", List.of(
            new Rule("min", "<", 1000, "underspeed_fault"),
            new Rule("max", ">", 3400, "overspeed_fault")
        ),
        "power_draw", List.of(new Rule("avg", ">", 65, "power_spike"))
    );

    static double fieldValue(Aggregation.Summary summary, String field) {
        return switch (field) {
            case "avg" -> summary.avg();
            case "min" -> summary.min();
            case "max" -> summary.max();
            default -> throw new IllegalStateException("unknown field " + field);
        };
    }

    public static List<String> evaluate(String sensorType, Aggregation.Summary summary) {
        List<String> fired = new ArrayList<>();
        for (Rule rule : THRESHOLDS.getOrDefault(sensorType, List.of())) {
            double value = fieldValue(summary, rule.field());
            boolean triggered = rule.op().equals("<") ? value < rule.limit() : value > rule.limit();
            if (triggered) fired.add(rule.key());
        }
        return fired;
    }
}
