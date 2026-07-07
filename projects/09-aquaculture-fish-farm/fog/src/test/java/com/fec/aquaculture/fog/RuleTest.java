package com.fec.aquaculture.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RuleTest {

    @Test
    void fluentChainBuildsARuleWithAllMetadata() {
        Rule rule = Rule.on("dissolved_oxygen_mgl").when(Field.AVG).lessThan(4.0).flagAs("hypoxia_risk");

        assertEquals("dissolved_oxygen_mgl", rule.sensorType());
        assertEquals("avg", rule.field());
        assertEquals("<", rule.op());
        assertEquals(4.0, rule.limit());
        assertEquals("hypoxia_risk", rule.key());
    }

    @Test
    void greaterThanRuleFiresOnlyAboveLimit() {
        Rule rule = Rule.on("ammonia_ppm").when(Field.AVG).greaterThan(0.5).flagAs("toxicity_risk");
        WindowAggregate below = WindowAggregate.of("ammonia_ppm", "pond-1", "ppm", List.of(0.4), "s", "e");
        WindowAggregate above = WindowAggregate.of("ammonia_ppm", "pond-1", "ppm", List.of(0.6), "s", "e");

        assertFalse(rule.firesOn("ammonia_ppm", below));
        assertTrue(rule.firesOn("ammonia_ppm", above));
    }

    @Test
    void ruleNeverFiresForADifferentSensorType() {
        Rule rule = Rule.on("water_temp_c").when(Field.AVG).greaterThan(30.0).flagAs("heat_stress");
        WindowAggregate hotButWrongType = WindowAggregate.of("ph_level", "pond-1", "pH", List.of(40.0), "s", "e");
        assertFalse(rule.firesOn("ph_level", hotButWrongType));
    }

    @Test
    void minAndMaxFieldsAreUsableInTheChain() {
        Rule minRule = Rule.on("x").when(Field.MIN).lessThan(1.0).flagAs("min_key");
        Rule maxRule = Rule.on("x").when(Field.MAX).greaterThan(9.0).flagAs("max_key");
        assertEquals("min", minRule.field());
        assertEquals("max", maxRule.field());
    }
}
