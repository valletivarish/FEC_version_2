package com.fec.aquaculture.sensor;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PondSensorUnitTest {

    @Test
    void allFiveSensorTypesAreRegistered() {
        assertEquals(5, PondSensorUnit.METRICS.size());
        assertTrue(PondSensorUnit.METRICS.containsKey("water_temp_c"));
        assertTrue(PondSensorUnit.METRICS.containsKey("dissolved_oxygen_mgl"));
        assertTrue(PondSensorUnit.METRICS.containsKey("ph_level"));
        assertTrue(PondSensorUnit.METRICS.containsKey("ammonia_ppm"));
        assertTrue(PondSensorUnit.METRICS.containsKey("feed_dispensed_g"));
    }

    @Test
    void everyProfileHasAUnitAndAStartWithinItsOwnBounds() {
        PondSensorUnit.METRICS.forEach((type, metric) -> {
            assertTrue(metric.unit() != null && !metric.unit().isEmpty(), type + " missing unit");
            assertTrue(metric.start() >= metric.walk().lo() && metric.start() <= metric.walk().hi(),
                type + " start value out of its own [lo,hi] bounds");
        });
    }

    @Test
    void payloadShapeIncludesSensorTypeSiteUnitAndReadings() {
        List<PondSensorUnit.Sample> samples = List.of(
            new PondSensorUnit.Sample(Instant.parse("2026-01-01T00:00:00Z"), 7.12),
            new PondSensorUnit.Sample(Instant.parse("2026-01-01T00:00:02Z"), 7.18)
        );
        String json = PondSensorUnit.payload("dissolved_oxygen_mgl", "pond-1", "mg/L", samples);

        assertTrue(json.contains("\"sensor_type\":\"dissolved_oxygen_mgl\""));
        assertTrue(json.contains("\"site_id\":\"pond-1\""));
        assertTrue(json.contains("\"unit\":\"mg/L\""));
        assertTrue(json.contains("\"ts\":\"2026-01-01T00:00:00Z\""));
        assertTrue(json.contains("\"value\":7.12"));
        assertTrue(json.contains("\"value\":7.18"));
    }

    @Test
    void payloadWithNoSamplesProducesEmptyReadingsArray() {
        String json = PondSensorUnit.payload("ph_level", "pond-2", "pH", List.of());
        assertTrue(json.contains("\"readings\":[]"));
    }
}
