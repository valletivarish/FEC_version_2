package com.fec.aquaculture.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PondGatewayTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void ingestAccumulatesReadingsPerSensorSitePairAndFlushProducesAggregates() {
        PondGateway gateway = new PondGateway();
        gateway.ingest("dissolved_oxygen_mgl", "pond-1", "mg/L", List.of(6.0, 7.0));
        gateway.ingest("dissolved_oxygen_mgl", "pond-1", "mg/L", List.of(8.0));
        gateway.ingest("ph_level", "pond-2", "pH", List.of(7.1));

        List<WindowAggregate> flushed = gateway.flushWindow();
        assertEquals(2, flushed.size());

        WindowAggregate doAgg = flushed.stream()
            .filter(w -> w.sensorType().equals("dissolved_oxygen_mgl")).findFirst().orElseThrow();
        assertEquals(3, doAgg.count());
        assertEquals(6.0, doAgg.min());
        assertEquals(8.0, doAgg.max());
        assertEquals("pond-1", doAgg.siteId());
    }

    @Test
    void distinctSitesForTheSameSensorTypeStayInSeparateBuckets() {
        PondGateway gateway = new PondGateway();
        gateway.ingest("water_temp_c", "pond-1", "C", List.of(24.0));
        gateway.ingest("water_temp_c", "pond-2", "C", List.of(26.0));

        List<WindowAggregate> flushed = gateway.flushWindow();
        assertEquals(2, flushed.size());
        assertTrue(flushed.stream().anyMatch(w -> w.siteId().equals("pond-1") && w.latest() == 24.0));
        assertTrue(flushed.stream().anyMatch(w -> w.siteId().equals("pond-2") && w.latest() == 26.0));
    }

    @Test
    void flushWindowClearsTheBufferSoASecondFlushIsEmpty() {
        PondGateway gateway = new PondGateway();
        gateway.ingest("ammonia_ppm", "pond-1", "ppm", List.of(0.2));
        assertEquals(1, gateway.flushWindow().size());
        assertEquals(0, gateway.flushWindow().size());
    }

    @Test
    void emptyBucketsAreSkippedNotEmittedAsZeroAggregates() {
        PondGateway gateway = new PondGateway();
        List<WindowAggregate> flushed = gateway.flushWindow();
        assertEquals(0, flushed.size());
    }

    @Test
    void thresholdsJsonExposesTheRealRulesGroupedBySensorType() throws Exception {
        JsonNode node = JSON.readTree(PondGateway.thresholdsJson());
        assertTrue(node.has("dissolved_oxygen_mgl"));
        assertTrue(node.has("ammonia_ppm"));
        assertTrue(node.has("water_temp_c"));
        assertTrue(node.has("ph_level"));
        assertEquals(2, node.get("ph_level").size(), "ph_level has both an alkaline and acidic rule");
        assertEquals("hypoxia_risk", node.get("dissolved_oxygen_mgl").get(0).get("key").asText());
    }
}
