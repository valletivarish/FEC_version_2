package com.fec.transit.sensor;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TransitSensorUnitTest {

    @Test
    void allFiveSensorTypesAreRegistered() {
        assertEquals(5, TransitSensorUnit.METRICS.size());
        assertTrue(TransitSensorUnit.METRICS.containsKey("engine_temp_c"));
        assertTrue(TransitSensorUnit.METRICS.containsKey("brake_pad_wear_pct"));
        assertTrue(TransitSensorUnit.METRICS.containsKey("passenger_count"));
        assertTrue(TransitSensorUnit.METRICS.containsKey("fuel_level_pct"));
        assertTrue(TransitSensorUnit.METRICS.containsKey("gps_speed_kmh"));
    }

    @Test
    void everyProfileHasAUnitAndAStartWithinItsOwnBounds() {
        TransitSensorUnit.METRICS.forEach((type, metric) -> {
            assertTrue(metric.unit() != null && !metric.unit().isEmpty(), type + " missing unit");
            assertTrue(metric.start() >= metric.walk().lo() && metric.start() <= metric.walk().hi(),
                type + " start value out of its own [lo,hi] bounds");
        });
    }

    @Test
    void payloadShapeIncludesSensorTypeSiteUnitAndReadings() {
        List<TransitSensorUnit.Sample> samples = List.of(
            new TransitSensorUnit.Sample(Instant.parse("2026-01-01T00:00:00Z"), 87.5),
            new TransitSensorUnit.Sample(Instant.parse("2026-01-01T00:00:02Z"), 88.1)
        );
        String json = TransitSensorUnit.toIngestBody("engine_temp_c", "depot-a", "C", samples);

        assertTrue(json.contains("\"sensor_type\":\"engine_temp_c\""));
        assertTrue(json.contains("\"site_id\":\"depot-a\""));
        assertTrue(json.contains("\"unit\":\"C\""));
        assertTrue(json.contains("\"ts\":\"2026-01-01T00:00:00Z\""));
        assertTrue(json.contains("\"value\":87.5"));
        assertTrue(json.contains("\"value\":88.1"));
    }

    @Test
    void payloadWithNoSamplesProducesEmptyReadingsArray() {
        String json = TransitSensorUnit.toIngestBody("gps_speed_kmh", "depot-b", "km/h", List.of());
        assertTrue(json.contains("\"readings\":[]"));
    }
}
