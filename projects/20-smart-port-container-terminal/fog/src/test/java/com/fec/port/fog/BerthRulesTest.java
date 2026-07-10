package com.fec.port.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BerthRulesTest {

    static WindowAggregate window(String sensorType, double min, double max, double avg) {
        return new WindowAggregate(sensorType, "berth-a", "u", "ws", "we", 1, min, max, avg, avg);
    }

    @Test
    void craneOverloadFiresAboveThirtyTwoThousand() {
        assertEquals(List.of("crane_overload_risk"),
            BerthRules.assess("crane_load_kg", window("crane_load_kg", 30000, 33000, 32500)));
    }

    @Test
    void craneLoadWithinLimitIsSilent() {
        assertEquals(List.of(), BerthRules.assess("crane_load_kg", window("crane_load_kg", 10000, 20000, 15000)));
    }

    @Test
    void highWindFiresAboveThirtyFourKnots() {
        assertEquals(List.of("high_wind_crane_halt"),
            BerthRules.assess("wind_speed_knots", window("wind_speed_knots", 30, 40, 36)));
    }

    @Test
    void berthCongestionFiresAboveNinetyPercent() {
        assertEquals(List.of("berth_congestion_warning"),
            BerthRules.assess("berth_occupancy_pct", window("berth_occupancy_pct", 85, 95, 92)));
    }

    @Test
    void reeferBreachFiresAboveMinusTenCelsius() {
        assertEquals(List.of("reefer_temp_breach"),
            BerthRules.assess("reefer_temp_c", window("reefer_temp_c", -12, -8, -9)));
    }

    @Test
    void reeferWithinColdChainRangeIsSilent() {
        assertEquals(List.of(), BerthRules.assess("reefer_temp_c", window("reefer_temp_c", -20, -16, -18)));
    }

    @Test
    void containerStackHeightNeverAlertsBecauseItHasNoRule() {
        assertEquals(List.of(), BerthRules.assess("container_stack_height", window("container_stack_height", 1, 8, 4)));
    }

    @Test
    void unknownSensorTypeHasNoRules() {
        assertEquals(List.of(), BerthRules.assess("bilge_pump_rpm", window("bilge_pump_rpm", 999, 999, 999)));
    }

    @Test
    void catalogExposesExactlyFourAlertBearingRules() {
        assertEquals(4, BerthRules.CATALOG.size());
    }
}
