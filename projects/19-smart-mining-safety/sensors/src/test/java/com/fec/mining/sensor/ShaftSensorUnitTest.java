package com.fec.mining.sensor;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ShaftSensorUnitTest {

    @Test
    void clampKeepsValueWithinBounds() {
        assertEquals(10.0, ShaftSensorUnit.clamp(5.0, 10.0, 20.0));
        assertEquals(20.0, ShaftSensorUnit.clamp(25.0, 10.0, 20.0));
        assertEquals(15.0, ShaftSensorUnit.clamp(15.0, 10.0, 20.0));
    }

    @Test
    void nextValueNeverLeavesTheProfileRange() {
        ShaftSensorUnit.Profile profile = ShaftSensorUnit.PROFILES.get("methane_ppm");
        double value = profile.start();
        for (int i = 0; i < 500; i++) {
            value = ShaftSensorUnit.nextValue(value, profile);
            assertTrue(value >= profile.lo() && value <= profile.hi(),
                "value " + value + " left [" + profile.lo() + "," + profile.hi() + "]");
        }
    }

    @Test
    void nextValueIsRoundedToTwoDecimals() {
        ShaftSensorUnit.Profile profile = new ShaftSensorUnit.Profile("x", 0, 100, 50, 1.0);
        double value = ShaftSensorUnit.nextValue(50.0, profile);
        assertEquals(value, Math.round(value * 100.0) / 100.0);
    }

    @Test
    void allFiveRequiredSensorTypesHaveProfiles() {
        assertEquals(5, ShaftSensorUnit.PROFILES.size());
        for (String type : List.of("methane_ppm", "co_ppm", "dust_concentration_mgm3",
                "ground_vibration_mms", "ambient_temp_c")) {
            assertTrue(ShaftSensorUnit.PROFILES.containsKey(type), "missing profile for " + type);
        }
    }

    @Test
    void toJsonProducesExpectedShape() {
        List<ShaftSensorUnit.Reading> batch = List.of(
            new ShaftSensorUnit.Reading("t0", 320.5),
            new ShaftSensorUnit.Reading("t1", 340.0)
        );
        String json = ShaftSensorUnit.toJson("methane_ppm", "shaft-a", "ppm", batch);
        assertTrue(json.contains("\"sensor_type\":\"methane_ppm\""));
        assertTrue(json.contains("\"site_id\":\"shaft-a\""));
        assertTrue(json.contains("\"unit\":\"ppm\""));
        assertTrue(json.contains("\"value\":320.5"));
        assertTrue(json.contains("\"value\":340.0"));
    }
}
