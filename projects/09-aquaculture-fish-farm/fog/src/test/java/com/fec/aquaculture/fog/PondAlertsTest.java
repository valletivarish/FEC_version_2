package com.fec.aquaculture.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PondAlertsTest {

    private static WindowAggregate windowWithAvg(String sensorType, double avg) {
        // avg is computed from the values, so a single-value window makes
        // avg == that value, letting each test target avg precisely.
        return WindowAggregate.of(sensorType, "pond-1", "unit", List.of(avg), "start", "end");
    }

    @Test
    void hypoxiaRiskFiresWhenDissolvedOxygenAverageBelowFour() {
        WindowAggregate window = windowWithAvg("dissolved_oxygen_mgl", 3.9);
        assertEquals(List.of("hypoxia_risk"), PondAlerts.evaluate("dissolved_oxygen_mgl", window));
    }

    @Test
    void hypoxiaRiskDoesNotFireAtExactlyFour() {
        WindowAggregate window = windowWithAvg("dissolved_oxygen_mgl", 4.0);
        assertTrue(PondAlerts.evaluate("dissolved_oxygen_mgl", window).isEmpty());
    }

    @Test
    void toxicityRiskFiresWhenAmmoniaAverageAboveHalf() {
        WindowAggregate window = windowWithAvg("ammonia_ppm", 0.51);
        assertEquals(List.of("toxicity_risk"), PondAlerts.evaluate("ammonia_ppm", window));
    }

    @Test
    void heatStressFiresWhenWaterTempAverageAboveThirty() {
        WindowAggregate window = windowWithAvg("water_temp_c", 30.1);
        assertEquals(List.of("heat_stress"), PondAlerts.evaluate("water_temp_c", window));
    }

    @Test
    void alkalineRiskFiresWhenPhAverageAboveEightPointFive() {
        WindowAggregate window = windowWithAvg("ph_level", 8.6);
        assertEquals(List.of("alkaline_risk"), PondAlerts.evaluate("ph_level", window));
    }

    @Test
    void acidicRiskFiresWhenPhAverageBelowSixPointFive() {
        WindowAggregate window = windowWithAvg("ph_level", 6.4);
        assertEquals(List.of("acidic_risk"), PondAlerts.evaluate("ph_level", window));
    }

    @Test
    void phLevelInSafeRangeFiresNoAlerts() {
        WindowAggregate window = windowWithAvg("ph_level", 7.2);
        assertTrue(PondAlerts.evaluate("ph_level", window).isEmpty());
    }

    @Test
    void feedDispensedHasNoRuleAndNeverFires() {
        WindowAggregate window = windowWithAvg("feed_dispensed_g", 999.0);
        assertTrue(PondAlerts.evaluate("feed_dispensed_g", window).isEmpty());
    }

    @Test
    void forSensorTypeReturnsBothPhRulesForPhLevel() {
        assertEquals(2, PondAlerts.forSensorType("ph_level").size());
    }

    @Test
    void forSensorTypeReturnsExactlyOneRuleForSingleDirectionSensors() {
        assertEquals(1, PondAlerts.forSensorType("dissolved_oxygen_mgl").size());
        assertEquals(1, PondAlerts.forSensorType("ammonia_ppm").size());
        assertEquals(1, PondAlerts.forSensorType("water_temp_c").size());
    }
}
