package com.fec.retail.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AlertRuleTest {

    @Test
    void restockNeededFiresBelowFifteenAvg() {
        WindowAggregate w = WindowAggregate.of("shelf_stock_pct", "store-1", "%", List.of(10.0, 12.0), "s", "e");
        assertTrue(AlertRule.RESTOCK_NEEDED.test(w));
        assertEquals("<", AlertRule.RESTOCK_NEEDED.op());
        assertEquals("restock_needed", AlertRule.RESTOCK_NEEDED.key());
    }

    @Test
    void restockNeededDoesNotFireAtBoundary() {
        WindowAggregate w = WindowAggregate.of("shelf_stock_pct", "store-1", "%", List.of(15.0), "s", "e");
        assertFalse(AlertRule.RESTOCK_NEEDED.test(w));
    }

    @Test
    void refrigerationWarningFiresAboveEightAvg() {
        WindowAggregate w = WindowAggregate.of("fridge_temp_c", "store-1", "C", List.of(9.0, 10.0), "s", "e");
        assertTrue(AlertRule.REFRIGERATION_WARNING.test(w));
        assertEquals(">", AlertRule.REFRIGERATION_WARNING.op());
    }

    @Test
    void refrigerationWarningDoesNotFireAtBoundary() {
        WindowAggregate w = WindowAggregate.of("fridge_temp_c", "store-1", "C", List.of(8.0), "s", "e");
        assertFalse(AlertRule.REFRIGERATION_WARNING.test(w));
    }

    @Test
    void checkoutCongestionFiresAboveTwelveAvg() {
        WindowAggregate w = WindowAggregate.of("queue_length", "store-2", "people", List.of(13.0, 14.0), "s", "e");
        assertTrue(AlertRule.CHECKOUT_CONGESTION.test(w));
    }

    @Test
    void capacityWarningFiresAboveFiveHundredAvg() {
        WindowAggregate w = WindowAggregate.of("footfall_count", "store-1", "visitors", List.of(510.0, 520.0), "s", "e");
        assertTrue(AlertRule.CAPACITY_WARNING.test(w));
    }

    @Test
    void ruleExposesFieldAndLimitForDescriptiveOutput() {
        assertEquals("avg", AlertRule.CHECKOUT_CONGESTION.field());
        assertEquals(12.0, AlertRule.CHECKOUT_CONGESTION.limit());
        assertEquals("queue_length", AlertRule.CHECKOUT_CONGESTION.sensorType());
    }
}
