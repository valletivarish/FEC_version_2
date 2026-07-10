package com.fec.port.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BatchPayloadJsonTest {

    @Test
    void buildProducesTheFullExpectedFieldSet() throws Exception {
        WindowAggregate w = new WindowAggregate("crane_load_kg", "berth-a", "kg", "ws", "we", 4, 14000, 18000, 16000, 17500);
        String json = BatchPayloadJson.build(w, List.of("crane_overload_risk"));

        ObjectMapper mapper = new ObjectMapper();
        JsonNode node = mapper.readTree(json);
        assertEquals("crane_load_kg", node.get("sensor_type").asText());
        assertEquals("berth-a", node.get("site_id").asText());
        assertEquals("kg", node.get("unit").asText());
        assertEquals("ws", node.get("window_start").asText());
        assertEquals("we", node.get("window_end").asText());
        assertEquals(4, node.get("count").asInt());
        assertEquals(14000, node.get("min").asDouble());
        assertEquals(18000, node.get("max").asDouble());
        assertEquals(16000, node.get("avg").asDouble());
        assertEquals(17500, node.get("latest").asDouble());
        assertEquals(1, node.get("alerts").size());
        assertEquals("crane_overload_risk", node.get("alerts").get(0).asText());
    }

    @Test
    void buildProducesValidJsonWithNoAlerts() throws Exception {
        WindowAggregate w = new WindowAggregate("container_stack_height", "berth-b", "count", "ws", "we", 2, 2, 4, 3, 4);
        String json = BatchPayloadJson.build(w, List.of());

        JsonNode node = new ObjectMapper().readTree(json);
        assertTrue(node.get("alerts").isArray());
        assertEquals(0, node.get("alerts").size());
    }

    @Test
    void buildEscapesQuotesAndBackslashes() throws Exception {
        WindowAggregate w = new WindowAggregate("weird\"type", "berth-a", "u\\nit", "ws", "we", 1, 1, 1, 1, 1);
        String json = BatchPayloadJson.build(w, List.of());

        JsonNode node = new ObjectMapper().readTree(json);
        assertEquals("weird\"type", node.get("sensor_type").asText());
        assertEquals("u\\nit", node.get("unit").asText());
    }
}
