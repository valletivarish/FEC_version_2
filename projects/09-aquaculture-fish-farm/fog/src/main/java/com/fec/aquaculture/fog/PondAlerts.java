package com.fec.aquaculture.fog;

import java.util.ArrayList;
import java.util.List;

/**
 * The real fish-farm threshold rules, assembled once at class-init time
 * through the Rule fluent DSL (see Rule.java) into a flat List<Rule>. Two
 * rules share the same sensor type (ph_level) with opposite directions,
 * proving the DSL isn't limited to one rule per field.
 */
public class PondAlerts {

    static final List<Rule> RULES = List.of(
        Rule.on("dissolved_oxygen_mgl").when(Field.AVG).lessThan(4.0).flagAs("hypoxia_risk"),
        Rule.on("ammonia_ppm").when(Field.AVG).greaterThan(0.5).flagAs("toxicity_risk"),
        Rule.on("water_temp_c").when(Field.AVG).greaterThan(30.0).flagAs("heat_stress"),
        Rule.on("ph_level").when(Field.AVG).greaterThan(8.5).flagAs("alkaline_risk"),
        Rule.on("ph_level").when(Field.AVG).lessThan(6.5).flagAs("acidic_risk")
    );

    public static List<String> evaluate(String sensorType, WindowAggregate window) {
        List<String> fired = new ArrayList<>();
        for (Rule rule : RULES) {
            if (rule.sensorType().equals(sensorType) && rule.firesOn(sensorType, window)) {
                fired.add(rule.key());
            }
        }
        return fired;
    }

    static List<Rule> forSensorType(String sensorType) {
        List<Rule> matches = new ArrayList<>();
        for (Rule rule : RULES) {
            if (rule.sensorType().equals(sensorType)) matches.add(rule);
        }
        return matches;
    }
}
