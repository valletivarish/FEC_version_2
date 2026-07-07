package com.fec.retail.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AlertRuleEvaluateTest {

    @Test
    void evaluateFiresMatchingRuleForSensorType() {
        WindowAggregate w = WindowAggregate.of("shelf_stock_pct", "store-1", "%",
            List.of(8.0, 9.0, 10.0), "s", "e");
        assertEquals(List.of("restock_needed"), AlertRule.evaluate(w));
    }

    @Test
    void evaluateReturnsEmptyWhenHealthy() {
        WindowAggregate w = WindowAggregate.of("shelf_stock_pct", "store-1", "%",
            List.of(70.0, 72.0), "s", "e");
        assertTrue(AlertRule.evaluate(w).isEmpty());
    }

    @Test
    void energyDrawHasNoRules() {
        WindowAggregate w = WindowAggregate.of("energy_draw_kw", "store-1", "kW",
            List.of(50.0, 55.0), "s", "e");
        assertTrue(AlertRule.evaluate(w).isEmpty());
    }

    @Test
    void unknownSensorTypeReturnsEmpty() {
        WindowAggregate w = WindowAggregate.of("unknown", "store-1", "", List.of(1.0), "s", "e");
        assertTrue(AlertRule.evaluate(w).isEmpty());
    }

    @Test
    void forSensorTypeReturnsOnlyMatchingRules() {
        assertEquals(List.of(AlertRule.RESTOCK_NEEDED), AlertRule.forSensorType("shelf_stock_pct"));
        assertEquals(List.of(AlertRule.CAPACITY_WARNING), AlertRule.forSensorType("footfall_count"));
        assertTrue(AlertRule.forSensorType("energy_draw_kw").isEmpty());
    }
}
