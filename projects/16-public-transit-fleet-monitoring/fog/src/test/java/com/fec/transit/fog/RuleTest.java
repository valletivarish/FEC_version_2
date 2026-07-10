package com.fec.transit.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RuleTest {

    @Test
    void avgAboveCarriesTheRightMetadata() {
        Rule rule = Rule.avgAbove("engine_temp_c", 105, "engine_overheat_risk");
        assertEquals("engine_temp_c", rule.sensorType());
        assertEquals("avg", rule.field());
        assertEquals(">", rule.op());
        assertEquals(105.0, rule.limit());
        assertEquals("engine_overheat_risk", rule.key());
    }

    @Test
    void avgAboveFiresOnlyStrictlyAboveTheLimit() {
        Rule rule = Rule.avgAbove("engine_temp_c", 105, "engine_overheat_risk");
        WindowAggregate atLimit = WindowAggregate.of("engine_temp_c", "depot-a", "C", List.of(105.0), "s", "e");
        WindowAggregate above = WindowAggregate.of("engine_temp_c", "depot-a", "C", List.of(105.1), "s", "e");

        assertFalse(rule.test().test(atLimit), "exactly at the limit must not fire");
        assertTrue(rule.test().test(above));
    }

    @Test
    void avgBelowFiresOnlyStrictlyBelowTheLimit() {
        Rule rule = Rule.avgBelow("fuel_level_pct", 15, "low_fuel_warning");
        WindowAggregate atLimit = WindowAggregate.of("fuel_level_pct", "depot-a", "%", List.of(15.0), "s", "e");
        WindowAggregate below = WindowAggregate.of("fuel_level_pct", "depot-a", "%", List.of(14.9), "s", "e");

        assertFalse(rule.test().test(atLimit));
        assertTrue(rule.test().test(below));
    }

    @Test
    void maxAboveReadsTheWindowMaxNotTheAverage() {
        Rule rule = Rule.maxAbove("passenger_count", 75, "overcrowding_alert");
        // avg stays under 75 even though one reading in the window spikes past it.
        WindowAggregate spiky = WindowAggregate.of("passenger_count", "depot-a", "people",
            List.of(30.0, 40.0, 80.0), "s", "e");
        assertEquals("max", rule.field());
        assertTrue(rule.test().test(spiky));
    }
}
