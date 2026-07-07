package com.fec.warehouse.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FleetAlertsTest {

    @Test
    void batteryCriticalFiresBelowFifteenAvg() {
        WindowAggregate w = WindowAggregate.of("battery_level_pct", "zone-a", "%",
            List.of(10.0, 12.0, 8.0), "s", "e");
        assertEquals(List.of("battery_critical"), FleetAlerts.evaluate("battery_level_pct", w));
    }

    @Test
    void batteryHealthyDoesNotFire() {
        WindowAggregate w = WindowAggregate.of("battery_level_pct", "zone-a", "%",
            List.of(80.0, 78.0, 82.0), "s", "e");
        assertTrue(FleetAlerts.evaluate("battery_level_pct", w).isEmpty());
    }

    @Test
    void motorOverheatFiresAboveSeventyFiveAvg() {
        WindowAggregate w = WindowAggregate.of("motor_temp_c", "zone-b", "C",
            List.of(80.0, 78.0, 82.0), "s", "e");
        assertEquals(List.of("motor_overheat"), FleetAlerts.evaluate("motor_temp_c", w));
    }

    @Test
    void navigationDriftFiresAboveSixAvg() {
        WindowAggregate w = WindowAggregate.of("position_drift_cm", "zone-a", "cm",
            List.of(7.0, 8.0, 9.0), "s", "e");
        assertEquals(List.of("navigation_drift"), FleetAlerts.evaluate("position_drift_cm", w));
    }

    @Test
    void fleetBacklogFiresAboveTwentyFiveAvg() {
        WindowAggregate w = WindowAggregate.of("task_queue_depth", "zone-b", "tasks",
            List.of(30.0, 28.0, 26.0), "s", "e");
        assertEquals(List.of("fleet_backlog"), FleetAlerts.evaluate("task_queue_depth", w));
    }

    @Test
    void payloadKgHasNoRules() {
        WindowAggregate w = WindowAggregate.of("payload_kg", "zone-a", "kg",
            List.of(190.0, 195.0), "s", "e");
        assertTrue(FleetAlerts.evaluate("payload_kg", w).isEmpty());
    }

    @Test
    void unknownSensorTypeReturnsEmpty() {
        WindowAggregate w = WindowAggregate.of("unknown", "zone-a", "", List.of(1.0), "s", "e");
        assertTrue(FleetAlerts.evaluate("unknown", w).isEmpty());
    }
}
