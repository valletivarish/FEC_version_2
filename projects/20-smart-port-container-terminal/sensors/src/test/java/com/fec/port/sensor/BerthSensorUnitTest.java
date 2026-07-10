package com.fec.port.sensor;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BerthSensorUnitTest {

    @Test
    void clampKeepsValueWithinBounds() {
        assertEquals(10.0, BerthSensorUnit.clamp(5.0, 10.0, 20.0));
        assertEquals(20.0, BerthSensorUnit.clamp(25.0, 10.0, 20.0));
        assertEquals(15.0, BerthSensorUnit.clamp(15.0, 10.0, 20.0));
    }

    @Test
    void nextValueNeverLeavesTheProfileRange() {
        BerthSensorUnit.Profile profile = BerthSensorUnit.PROFILES.get("crane_load_kg");
        double value = profile.start();
        for (int i = 0; i < 500; i++) {
            value = BerthSensorUnit.nextValue(value, profile);
            assertTrue(value >= profile.lo() && value <= profile.hi(),
                "value " + value + " left [" + profile.lo() + "," + profile.hi() + "]");
        }
    }

    @Test
    void nextValueIsRoundedToTwoDecimals() {
        BerthSensorUnit.Profile profile = new BerthSensorUnit.Profile("x", 0, 100, 50, 1.0);
        double value = BerthSensorUnit.nextValue(50.0, profile);
        assertEquals(value, Math.round(value * 100.0) / 100.0);
    }

    @Test
    void allFiveRequiredSensorTypesHaveProfiles() {
        assertEquals(5, BerthSensorUnit.PROFILES.size());
        for (String type : List.of("crane_load_kg", "container_stack_height", "wind_speed_knots",
                "berth_occupancy_pct", "reefer_temp_c")) {
            assertTrue(BerthSensorUnit.PROFILES.containsKey(type), "missing profile for " + type);
        }
    }

    @Test
    void reeferProfileAllowsNegativeValues() {
        BerthSensorUnit.Profile profile = BerthSensorUnit.PROFILES.get("reefer_temp_c");
        assertEquals(-25.0, profile.lo());
        assertEquals(-18.0, profile.start());
    }

    @Test
    void toJsonProducesExpectedShape() {
        List<BerthSensorUnit.Reading> batch = List.of(
            new BerthSensorUnit.Reading("t0", 15200.5),
            new BerthSensorUnit.Reading("t1", 15400.0)
        );
        String json = BerthSensorUnit.toJson("crane_load_kg", "berth-a", "kg", batch);
        assertTrue(json.contains("\"sensor_type\":\"crane_load_kg\""));
        assertTrue(json.contains("\"site_id\":\"berth-a\""));
        assertTrue(json.contains("\"unit\":\"kg\""));
        assertTrue(json.contains("\"value\":15200.5"));
        assertTrue(json.contains("\"value\":15400.0"));
    }
}
