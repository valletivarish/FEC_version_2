package com.fec.smartcity.fog;

import java.util.List;
import java.util.Map;

public class IncidentRules {

    public record RuleDescription(String field, String op, double limit, String key) {}

    // Declarative metadata surfaced via /thresholds; assess() below is kept independent on purpose.
    public static final Map<String, List<RuleDescription>> RULE_CATALOG = Map.of(
        "vehicle_count", List.of(new RuleDescription("avg", ">", 180, "congestion_risk")),
        "air_quality_pm25", List.of(new RuleDescription("avg", ">", 35, "air_quality_alert")),
        "noise_level", List.of(new RuleDescription("avg", ">", 75, "noise_violation")),
        "parking_occupancy", List.of(new RuleDescription("avg", ">", 95, "parking_full")),
        "ambient_light", List.of(new RuleDescription("avg", "<", 5, "low_visibility_alert"))
    );

    public static List<String> assess(String metric, WindowSummary.Digest digest) {
        return switch (metric) {
            case "vehicle_count" -> digest.avg() > 180 ? List.of("congestion_risk") : List.of();
            case "air_quality_pm25" -> digest.avg() > 35 ? List.of("air_quality_alert") : List.of();
            case "noise_level" -> digest.avg() > 75 ? List.of("noise_violation") : List.of();
            case "parking_occupancy" -> digest.avg() > 95 ? List.of("parking_full") : List.of();
            case "ambient_light" -> digest.avg() < 5 ? List.of("low_visibility_alert") : List.of();
            default -> List.of();
        };
    }
}
