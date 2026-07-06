package com.fec.industrial.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AlertsTest {

    static Aggregation.Summary summary(double min, double max, double avg) {
        return new Aggregation.Summary("t", "s", "u", "ws", "we", 1, min, max, avg, avg);
    }

    @Test
    void highVibrationTriggersBearingWearRisk() {
        assertEquals(List.of("bearing_wear_risk"), Alerts.evaluate("vibration", summary(7.5, 8.5, 8.0)));
    }

    @Test
    void healthyVibrationIsSilent() {
        assertEquals(List.of(), Alerts.evaluate("vibration", summary(1.5, 2.5, 2.0)));
    }

    @Test
    void motorOverheating() {
        assertEquals(List.of("overheating"), Alerts.evaluate("motor_temperature", summary(98, 102, 100)));
    }

    @Test
    void rotationSpeedCanRaiseTwoAlerts() {
        List<String> fired = Alerts.evaluate("rotation_speed", summary(900, 3500, 2000));
        assertTrue(fired.contains("underspeed_fault"));
        assertTrue(fired.contains("overspeed_fault"));
    }

    @Test
    void rotationSpeedWithinBandIsSilent() {
        assertEquals(List.of(), Alerts.evaluate("rotation_speed", summary(1500, 2200, 1800)));
    }

    @Test
    void powerSpikeUsesAvg() {
        assertEquals(List.of("power_spike"), Alerts.evaluate("power_draw", summary(60, 75, 70)));
    }

    @Test
    void unknownSensorHasNoRules() {
        assertEquals(List.of(), Alerts.evaluate("pressure", summary(999, 999, 999)));
    }
}
