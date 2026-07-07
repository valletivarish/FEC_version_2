package com.fec.warehouse.sensor;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RobotUnitTest {

    @Test
    void payloadEncodesMetricZoneAndReadings() {
        List<RobotUnit.Sample> samples = List.of(
            new RobotUnit.Sample(Instant.parse("2026-01-01T00:00:00Z"), 12.5),
            new RobotUnit.Sample(Instant.parse("2026-01-01T00:00:02Z"), 13.0)
        );
        String json = RobotUnit.payload("motor_temp_c", "zone-a", "C", samples);

        assertTrue(json.contains("\"sensor_type\":\"motor_temp_c\""));
        assertTrue(json.contains("\"site_id\":\"zone-a\""));
        assertTrue(json.contains("\"unit\":\"C\""));
        assertTrue(json.contains("\"value\":12.5"));
        assertTrue(json.contains("\"value\":13.0"));
    }

    @Test
    void payloadHandlesEmptyReadingList() {
        String json = RobotUnit.payload("battery_level_pct", "zone-b", "%", List.of());
        assertTrue(json.contains("\"readings\":[]"));
    }

    @Test
    void allFiveMetricProfilesAreDefined() {
        assertEquals(5, RobotUnit.METRICS.size());
        assertTrue(RobotUnit.METRICS.containsKey("battery_level_pct"));
        assertTrue(RobotUnit.METRICS.containsKey("payload_kg"));
        assertTrue(RobotUnit.METRICS.containsKey("motor_temp_c"));
        assertTrue(RobotUnit.METRICS.containsKey("position_drift_cm"));
        assertTrue(RobotUnit.METRICS.containsKey("task_queue_depth"));
    }
}
