package com.fec.transit.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TransitGatewayTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void ingestAccumulatesReadingsPerSensorSitePairAndFlushProducesAggregates() {
        TransitGateway gateway = new TransitGateway();
        gateway.ingest("engine_temp_c", "depot-a", "C", List.of(88.0, 90.0));
        gateway.ingest("engine_temp_c", "depot-a", "C", List.of(92.0));
        gateway.ingest("fuel_level_pct", "depot-b", "%", List.of(65.0));

        List<WindowAggregate> flushed = gateway.flushWindow();
        assertEquals(2, flushed.size());

        WindowAggregate engineAgg = flushed.stream()
            .filter(w -> w.sensorType().equals("engine_temp_c")).findFirst().orElseThrow();
        assertEquals(3, engineAgg.count());
        assertEquals(88.0, engineAgg.min());
        assertEquals(92.0, engineAgg.max());
        assertEquals("depot-a", engineAgg.siteId());
    }

    @Test
    void distinctDepotsForTheSameSensorTypeStayInSeparateGroups() {
        TransitGateway gateway = new TransitGateway();
        gateway.ingest("gps_speed_kmh", "depot-a", "km/h", List.of(40.0));
        gateway.ingest("gps_speed_kmh", "depot-b", "km/h", List.of(60.0));

        List<WindowAggregate> flushed = gateway.flushWindow();
        assertEquals(2, flushed.size());
        assertTrue(flushed.stream().anyMatch(w -> w.siteId().equals("depot-a") && w.latest() == 40.0));
        assertTrue(flushed.stream().anyMatch(w -> w.siteId().equals("depot-b") && w.latest() == 60.0));
    }

    @Test
    void flushWindowClearsTheIntakeQueueSoASecondFlushIsEmpty() {
        TransitGateway gateway = new TransitGateway();
        gateway.ingest("brake_pad_wear_pct", "depot-a", "%", List.of(22.0));
        assertEquals(1, gateway.flushWindow().size());
        assertEquals(0, gateway.flushWindow().size());
    }

    @Test
    void emptyIntakeProducesNoAggregatesOnFlush() {
        TransitGateway gateway = new TransitGateway();
        assertEquals(0, gateway.flushWindow().size());
    }

    @Test
    void thresholdsJsonExposesTheRealRulesGroupedBySensorTypeAndOmitsGpsSpeed() throws Exception {
        JsonNode node = JSON.readTree(TransitGateway.thresholdsJson());
        assertTrue(node.has("engine_temp_c"));
        assertTrue(node.has("brake_pad_wear_pct"));
        assertTrue(node.has("fuel_level_pct"));
        assertTrue(node.has("passenger_count"));
        assertTrue(!node.has("gps_speed_kmh"), "gps_speed_kmh has no alert rule so it must not appear");
        assertEquals("engine_overheat_risk", node.get("engine_temp_c").get(0).get("key").asText());
        assertEquals("max", node.get("passenger_count").get(0).get("field").asText());
    }

    @Test
    void toPayloadIncludesAllRequiredFieldsAndAlerts() throws Exception {
        WindowAggregate window = WindowAggregate.of("engine_temp_c", "depot-a", "C", List.of(110.0), "s", "e");
        String json = TransitGateway.toPayload(window, List.of("engine_overheat_risk"));
        JsonNode node = JSON.readTree(json);

        assertEquals("engine_temp_c", node.get("sensor_type").asText());
        assertEquals("depot-a", node.get("site_id").asText());
        assertEquals("C", node.get("unit").asText());
        assertEquals("s", node.get("window_start").asText());
        assertEquals("e", node.get("window_end").asText());
        assertEquals(1, node.get("count").asInt());
        assertEquals(110.0, node.get("avg").asDouble());
        assertEquals(1, node.get("alerts").size());
        assertEquals("engine_overheat_risk", node.get("alerts").get(0).asText());
    }
}
