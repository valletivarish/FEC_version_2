package com.fec.industrial.sensor;

import org.junit.jupiter.api.Test;
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
}
