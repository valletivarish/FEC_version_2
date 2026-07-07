package com.fec.warehouse.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class FleetAlerts {

    public static final Map<String, List<AlertRule>> RULES = Map.of(
        "battery_level_pct", List.of(AlertRule.below("avg", AlertRule.AVG, 15, "battery_critical")),
        "motor_temp_c", List.of(AlertRule.above("avg", AlertRule.AVG, 75, "motor_overheat")),
        "position_drift_cm", List.of(AlertRule.above("avg", AlertRule.AVG, 6, "navigation_drift")),
        "task_queue_depth", List.of(AlertRule.above("avg", AlertRule.AVG, 25, "fleet_backlog"))
    );

    public static List<String> evaluate(String sensorType, WindowAggregate window) {
        List<String> fired = new ArrayList<>();
        for (AlertRule rule : RULES.getOrDefault(sensorType, List.of())) {
            if (rule.firesOn(window)) fired.add(rule.key());
        }
        return fired;
    }
}
