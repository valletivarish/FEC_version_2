package com.fec.transit.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TransitAlertsTest {

    private static WindowAggregate windowWithAvg(String sensorType, double avg) {
        // avg is computed from the values, so a single-value window makes
        // avg == that value, letting each test target avg precisely.
        return WindowAggregate.of(sensorType, "depot-a", "unit", List.of(avg), "start", "end");
    }

    @Test
    void engineOverheatRiskFiresWhenAverageAboveOneOhFive() {
        WindowAggregate window = windowWithAvg("engine_temp_c", 105.1);
        assertEquals(List.of("engine_overheat_risk"), TransitAlerts.evaluate("engine_temp_c", window));
    }

    @Test
    void engineOverheatRiskDoesNotFireAtExactlyOneOhFive() {
        WindowAggregate window = windowWithAvg("engine_temp_c", 105.0);
        assertTrue(TransitAlerts.evaluate("engine_temp_c", window).isEmpty());
    }

    @Test
    void brakeServiceRequiredFiresWhenAverageAboveEighty() {
        WindowAggregate window = windowWithAvg("brake_pad_wear_pct", 80.5);
        assertEquals(List.of("brake_service_required"), TransitAlerts.evaluate("brake_pad_wear_pct", window));
    }

    @Test
    void lowFuelWarningFiresWhenAverageBelowFifteen() {
        WindowAggregate window = windowWithAvg("fuel_level_pct", 14.0);
        assertEquals(List.of("low_fuel_warning"), TransitAlerts.evaluate("fuel_level_pct", window));
    }

    @Test
    void overcrowdingAlertFiresOnMaxAboveSeventyFiveNotAverage() {
        WindowAggregate window = WindowAggregate.of("passenger_count", "depot-a", "people",
            List.of(20.0, 30.0, 78.0), "s", "e");
        assertEquals(List.of("overcrowding_alert"), TransitAlerts.evaluate("passenger_count", window));
    }

    @Test
    void overcrowdingAlertDoesNotFireWhenMaxStaysAtOrBelowSeventyFive() {
        WindowAggregate window = WindowAggregate.of("passenger_count", "depot-a", "people",
            List.of(20.0, 30.0, 75.0), "s", "e");
        assertTrue(TransitAlerts.evaluate("passenger_count", window).isEmpty());
    }

    @Test
    void gpsSpeedHasNoRuleAndNeverFires() {
        WindowAggregate window = windowWithAvg("gps_speed_kmh", 999.0);
        assertTrue(TransitAlerts.evaluate("gps_speed_kmh", window).isEmpty());
    }

    @Test
    void forSensorTypeReturnsExactlyOneRulePerCoveredSensorType() {
        assertEquals(1, TransitAlerts.forSensorType("engine_temp_c").size());
        assertEquals(1, TransitAlerts.forSensorType("brake_pad_wear_pct").size());
        assertEquals(1, TransitAlerts.forSensorType("fuel_level_pct").size());
        assertEquals(1, TransitAlerts.forSensorType("passenger_count").size());
    }

    @Test
    void forSensorTypeReturnsNoRulesForGpsSpeed() {
        assertTrue(TransitAlerts.forSensorType("gps_speed_kmh").isEmpty());
    }
}
