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
        assertEquals(List.of("bearing_wear_risk"), Alerts.diagnoseFaults("vibration", summary(7.5, 8.5, 8.0)));
    }

    @Test
    void healthyVibrationIsSilent() {
        assertEquals(List.of(), Alerts.diagnoseFaults("vibration", summary(1.5, 2.5, 2.0)));
    }

    @Test
    void motorOverheating() {
        assertEquals(List.of("overheating"), Alerts.diagnoseFaults("motor_temperature", summary(98, 102, 100)));
    }

    @Test
    void rotationSpeedCanRaiseTwoAlerts() {
        List<String> fired = Alerts.diagnoseFaults("rotation_speed", summary(900, 3500, 2000));
        assertTrue(fired.contains("underspeed_fault"));
        assertTrue(fired.contains("overspeed_fault"));
    }

    @Test
    void rotationSpeedWithinBandIsSilent() {
        assertEquals(List.of(), Alerts.diagnoseFaults("rotation_speed", summary(1500, 2200, 1800)));
    }

    @Test
    void powerSpikeUsesAvg() {
        assertEquals(List.of("power_spike"), Alerts.diagnoseFaults("power_draw", summary(60, 75, 70)));
    }

    @Test
    void unknownSensorHasNoRules() {
        assertEquals(List.of(), Alerts.diagnoseFaults("pressure", summary(999, 999, 999)));
    }

    @Test
    void bearingAcousticAnomalyFiresWhenAvgExceedsLimit() {
        assertEquals(List.of("acoustic_anomaly"), Alerts.diagnoseFaults("bearing_acoustic", summary(80, 92, 90)));
    }

    @Test
    void bearingAcousticHealthyIsSilent() {
        assertEquals(List.of(), Alerts.diagnoseFaults("bearing_acoustic", summary(55, 65, 60)));
    }

    @Test
    void rotationRaisesUnderspeedOnlyWhenMaxStaysInBand() {
        // min below the 1000 floor, but max well under the 3400 ceiling
        assertEquals(List.of("underspeed_fault"), Alerts.diagnoseFaults("rotation_speed", summary(900, 3000, 1600)));
    }

    @Test
    void rotationRaisesOverspeedOnlyWhenMinStaysInBand() {
        // max above the 3400 ceiling, but min well above the 1000 floor
        assertEquals(List.of("overspeed_fault"), Alerts.diagnoseFaults("rotation_speed", summary(1500, 3500, 2600)));
    }

    @Test
    void vibrationExactlyAtLimitStaysSilentBecauseTheRuleIsStrictlyGreater() {
        assertEquals(List.of(), Alerts.diagnoseFaults("vibration", summary(6.0, 8.0, 7.0)));
    }

    @Test
    void motorTemperatureIsSilentAtTheLimitButFiresJustAbove() {
        assertEquals(List.of(), Alerts.diagnoseFaults("motor_temperature", summary(90, 100, 95.0)));
        assertEquals(List.of("overheating"), Alerts.diagnoseFaults("motor_temperature", summary(90, 100, 95.1)));
    }

    @Test
    void windowMetricSelectsTheNamedField() {
        Aggregation.Summary s = new Aggregation.Summary("t", "s", "u", "ws", "we", 3, 11.0, 33.0, 22.0, 30.0);
        assertEquals(22.0, Alerts.windowMetric(s, "avg"));
        assertEquals(11.0, Alerts.windowMetric(s, "min"));
        assertEquals(33.0, Alerts.windowMetric(s, "max"));
    }

    @Test
    void windowMetricRejectsAnUnknownField() {
        Aggregation.Summary s = summary(1, 2, 1.5);
        assertThrows(IllegalStateException.class, () -> Alerts.windowMetric(s, "latest"));
    }
}
