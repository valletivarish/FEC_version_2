package com.fec.aquaculture.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StreamingJsonTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void aggregatePayloadContainsAllExpectedFields() throws Exception {
        WindowAggregate window = WindowAggregate.of("dissolved_oxygen_mgl", "pond-1", "mg/L",
            List.of(6.0, 7.0), "start", "end");
        String text = StreamingJson.aggregatePayload(window, List.of("hypoxia_risk"));
        JsonNode node = JSON.readTree(text);

        assertEquals("dissolved_oxygen_mgl", node.get("sensor_type").asText());
        assertEquals("pond-1", node.get("site_id").asText());
        assertEquals("mg/L", node.get("unit").asText());
        assertEquals("start", node.get("window_start").asText());
        assertEquals("end", node.get("window_end").asText());
        assertEquals(2, node.get("count").asInt());
        assertEquals(6.0, node.get("min").asDouble());
        assertEquals(7.0, node.get("max").asDouble());
        assertEquals(6.5, node.get("avg").asDouble());
        assertEquals(7.0, node.get("latest").asDouble());
        assertEquals(1, node.get("alerts").size());
        assertEquals("hypoxia_risk", node.get("alerts").get(0).asText());
    }

    @Test
    void aggregatePayloadWithNoAlertsProducesEmptyArray() throws Exception {
        WindowAggregate window = WindowAggregate.of("ph_level", "pond-1", "pH", List.of(7.2), "s", "e");
        JsonNode node = JSON.readTree(StreamingJson.aggregatePayload(window, List.of()));
        assertTrue(node.get("alerts").isArray());
        assertEquals(0, node.get("alerts").size());
    }

    @Test
    void thresholdsPayloadGroupsRulesBySensorType() throws Exception {
        Map<String, List<Rule>> grouped = Map.of(
            "ph_level", List.of(
                Rule.on("ph_level").when(Field.AVG).greaterThan(8.5).flagAs("alkaline_risk"),
                Rule.on("ph_level").when(Field.AVG).lessThan(6.5).flagAs("acidic_risk")
            )
        );
        JsonNode node = JSON.readTree(StreamingJson.thresholdsPayload(grouped));
        assertTrue(node.has("ph_level"));
        assertEquals(2, node.get("ph_level").size());
        assertEquals("avg", node.get("ph_level").get(0).get("field").asText());
        assertEquals(">", node.get("ph_level").get(0).get("op").asText());
        assertEquals(8.5, node.get("ph_level").get(0).get("limit").asDouble());
        assertEquals("alkaline_risk", node.get("ph_level").get(0).get("key").asText());
    }

    @Test
    void statusAcceptedAndErrorHelpersProduceExpectedShapes() throws Exception {
        assertEquals("ok", JSON.readTree(StreamingJson.status("ok")).get("status").asText());
        assertEquals(5, JSON.readTree(StreamingJson.accepted(5)).get("accepted").asInt());
        assertEquals("bad input", JSON.readTree(StreamingJson.error("bad input")).get("error").asText());
    }
}
