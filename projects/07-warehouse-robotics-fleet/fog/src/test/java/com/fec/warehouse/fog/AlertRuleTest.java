package com.fec.warehouse.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AlertRuleTest {

    @Test
    void aboveLimitFiresWhenFieldExceedsLimit() {
        AlertRule rule = AlertRule.above("avg", AlertRule.AVG, 75, "motor_overheat");
        WindowAggregate w = WindowAggregate.of("motor_temp_c", "zone-a", "C", List.of(80.0), "s", "e");
        assertTrue(rule.firesOn(w));
        assertEquals(">", rule.op());
    }

    @Test
    void aboveLimitDoesNotFireAtBoundary() {
        AlertRule rule = AlertRule.above("avg", AlertRule.AVG, 75, "motor_overheat");
        WindowAggregate w = WindowAggregate.of("motor_temp_c", "zone-a", "C", List.of(75.0), "s", "e");
        assertFalse(rule.firesOn(w));
    }

    @Test
    void belowLimitFiresWhenFieldUnderLimit() {
        AlertRule rule = AlertRule.below("avg", AlertRule.AVG, 15, "battery_critical");
        WindowAggregate w = WindowAggregate.of("battery_level_pct", "zone-a", "%", List.of(10.0), "s", "e");
        assertTrue(rule.firesOn(w));
        assertEquals("<", rule.op());
    }

    @Test
    void ruleExposesFieldAndLimitForDescriptiveOutput() {
        AlertRule rule = AlertRule.above("avg", AlertRule.MAX, 6, "navigation_drift");
        assertEquals("avg", rule.field());
        assertEquals(6.0, rule.limit());
        assertEquals("navigation_drift", rule.key());
    }
}
