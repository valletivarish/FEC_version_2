package com.fec.retail.sensor;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class StoreSensorUnitTest {

    @Test
    void payloadEncodesSensorTypeSiteAndReadings() {
        List<StoreSensorUnit.Sample> samples = List.of(
            new StoreSensorUnit.Sample(Instant.parse("2026-01-01T00:00:00Z"), 82.5),
            new StoreSensorUnit.Sample(Instant.parse("2026-01-01T00:00:02Z"), 91.0)
        );
        String json = StoreSensorUnit.payload("footfall_count", "store-1", "visitors", samples);

        assertTrue(json.contains("\"sensor_type\":\"footfall_count\""));
        assertTrue(json.contains("\"site_id\":\"store-1\""));
        assertTrue(json.contains("\"unit\":\"visitors\""));
        assertTrue(json.contains("\"value\":82.5"));
        assertTrue(json.contains("\"value\":91.0"));
    }

    @Test
    void payloadHandlesEmptyReadingList() {
        String json = StoreSensorUnit.payload("queue_length", "store-2", "people", List.of());
        assertTrue(json.contains("\"readings\":[]"));
    }

    @Test
    void allFiveSensorProfilesAreDefined() {
        assertEquals(5, StoreSensorUnit.METRICS.size());
        assertTrue(StoreSensorUnit.METRICS.containsKey("footfall_count"));
        assertTrue(StoreSensorUnit.METRICS.containsKey("shelf_stock_pct"));
        assertTrue(StoreSensorUnit.METRICS.containsKey("fridge_temp_c"));
        assertTrue(StoreSensorUnit.METRICS.containsKey("queue_length"));
        assertTrue(StoreSensorUnit.METRICS.containsKey("energy_draw_kw"));
    }
}
