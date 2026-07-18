package com.fec.industrial.sensor;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class SensorTest {

    @Test
    void clampKeepsValueInRange() {
        assertEquals(10, Sensor.clamp(50, 0, 10));
        assertEquals(0, Sensor.clamp(-5, 0, 10));
        assertEquals(5, Sensor.clamp(5, 0, 10));
    }

    @Test
    void nextValueStaysWithinProfileBounds() {
        Sensor.MachineProfile profile = Sensor.MACHINE_PROFILES.get("vibration");
        double value = profile.start();
        for (int i = 0; i < 500; i++) {
            value = Sensor.nextSample(value, profile);
            assertTrue(value >= profile.lo() && value <= profile.hi());
        }
    }

    @Test
    void allFiveSensorTypesHaveProfiles() {
        assertEquals(
            Set.of("vibration", "motor_temperature", "bearing_acoustic", "rotation_speed", "power_draw"),
            Sensor.MACHINE_PROFILES.keySet()
        );
    }

    @Test
    void nextValueMovesByAtMostStep() {
        Sensor.MachineProfile profile = new Sensor.MachineProfile("u", 0, 100, 50, 2.0);
        double newValue = Sensor.nextSample(50, profile);
        assertTrue(Math.abs(newValue - 50) <= profile.step());
    }

    @Test
    void clampReturnsTheBoundExactlyAtEachEdge() {
        assertEquals(0.0, Sensor.clamp(0, 0, 10));
        assertEquals(10.0, Sensor.clamp(10, 0, 10));
    }

    @Test
    void nextSampleRoundsToTwoDecimalPlaces() {
        Sensor.MachineProfile profile = Sensor.MACHINE_PROFILES.get("power_draw");
        double value = profile.start();
        for (int i = 0; i < 200; i++) {
            value = Sensor.nextSample(value, profile);
            assertEquals(value, Math.round(value * 100.0) / 100.0, "each sample is rounded to 2 dp");
        }
    }

    @Test
    void everyProfileKeepsItsBoundedWalkInRange() {
        for (Sensor.MachineProfile profile : Sensor.MACHINE_PROFILES.values()) {
            double value = profile.start();
            for (int i = 0; i < 300; i++) {
                value = Sensor.nextSample(value, profile);
                assertTrue(value >= profile.lo() && value <= profile.hi());
            }
        }
    }

    @Test
    void eachProfileCarriesItsMachineUnit() {
        assertEquals("mm/s", Sensor.MACHINE_PROFILES.get("vibration").unit());
        assertEquals("C", Sensor.MACHINE_PROFILES.get("motor_temperature").unit());
        assertEquals("dB", Sensor.MACHINE_PROFILES.get("bearing_acoustic").unit());
        assertEquals("RPM", Sensor.MACHINE_PROFILES.get("rotation_speed").unit());
        assertEquals("kW", Sensor.MACHINE_PROFILES.get("power_draw").unit());
    }

    @Test
    void everyProfileStartsInsideAPositiveWidthBand() {
        for (Sensor.MachineProfile profile : Sensor.MACHINE_PROFILES.values()) {
            assertTrue(profile.lo() < profile.hi(), "lo must be below hi");
            assertTrue(profile.start() >= profile.lo() && profile.start() <= profile.hi(), "start sits inside the band");
            assertTrue(profile.step() > 0, "step must be positive");
        }
    }

    @Test
    void encodePayloadShapesASingleReadingAsJson() {
        String body = Sensor.encodePayload("vibration", "line-1", "mm/s",
            List.of(new double[]{7.5}), List.of(Instant.parse("2026-01-01T00:00:00Z")));
        assertTrue(body.contains("\"sensor_type\":\"vibration\""));
        assertTrue(body.contains("\"site_id\":\"line-1\""));
        assertTrue(body.contains("\"unit\":\"mm/s\""));
        assertTrue(body.contains("\"ts\":\"2026-01-01T00:00:00Z\""));
        assertTrue(body.contains("\"value\":7.5"));
        assertTrue(body.endsWith("]}"));
    }

    @Test
    void encodePayloadJoinsMultipleReadingsWithCommas() {
        String body = Sensor.encodePayload("rotation_speed", "line-2", "RPM",
            List.of(new double[]{1800}, new double[]{1850}, new double[]{1790}),
            List.of(Instant.parse("2026-01-01T00:00:00Z"),
                    Instant.parse("2026-01-01T00:00:02Z"),
                    Instant.parse("2026-01-01T00:00:04Z")));
        assertEquals(3, countOccurrences(body, "\"value\":"), "one value field per reading");
        assertEquals(2, countOccurrences(body, "},{"), "readings are comma-separated");
        assertTrue(body.contains("\"site_id\":\"line-2\""));
    }

    private static int countOccurrences(String haystack, String needle) {
        int count = 0, idx = 0;
        while ((idx = haystack.indexOf(needle, idx)) >= 0) {
            count++;
            idx += needle.length();
        }
        return count;
    }
}
