package com.fec.retail.fog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AggregatePayloadTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void serializesAllFieldsIncludingFiredAlerts() throws Exception {
        WindowAggregate w = WindowAggregate.of("fridge_temp_c", "store-1", "C", List.of(9.0, 10.0), "s", "e");
        AggregatePayload payload = new AggregatePayload(w, List.of("cold_chain_risk"));

        String json = JSON.writeValueAsString(payload);
        assertTrue(json.contains("\"sensor_type\":\"fridge_temp_c\""));
        assertTrue(json.contains("\"site_id\":\"store-1\""));
        assertTrue(json.contains("\"alerts\":[\"cold_chain_risk\"]"));
    }

    @Test
    void serializesEmptyAlertsAsEmptyArray() throws Exception {
        WindowAggregate w = WindowAggregate.of("energy_draw_kw", "store-2", "kW", List.of(25.0), "s", "e");
        AggregatePayload payload = new AggregatePayload(w, List.of());

        String json = JSON.writeValueAsString(payload);
        assertTrue(json.contains("\"alerts\":[]"));
    }
}
