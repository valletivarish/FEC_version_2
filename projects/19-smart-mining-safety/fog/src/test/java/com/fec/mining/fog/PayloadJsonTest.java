package com.fec.mining.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PayloadJsonTest {

    @Test
    void producesTheExactFieldNamesTheProcessorExpects() {
        WindowAggregate window = new WindowAggregate("methane_ppm", "shaft-a", "ppm", "ws", "we", 4, 300.0, 900.0, 600.0, 850.0);
        String json = PayloadJson.toJson(window, List.of("methane_buildup_risk"));

        assertTrue(json.contains("\"sensor_type\":\"methane_ppm\""));
        assertTrue(json.contains("\"site_id\":\"shaft-a\""));
        assertTrue(json.contains("\"window_start\":\"ws\""));
        assertTrue(json.contains("\"window_end\":\"we\""));
        assertTrue(json.contains("\"count\":4"));
        assertTrue(json.contains("\"min\":300.0"));
        assertTrue(json.contains("\"max\":900.0"));
        assertTrue(json.contains("\"avg\":600.0"));
        assertTrue(json.contains("\"latest\":850.0"));
        assertTrue(json.contains("\"alerts\":[\"methane_buildup_risk\"]"));
    }

    @Test
    void emptyAlertsListStillProducesAnAlertsArray() {
        WindowAggregate window = new WindowAggregate("ambient_temp_c", "shaft-b", "C", "ws", "we", 1, 26.0, 26.0, 26.0, 26.0);
        String json = PayloadJson.toJson(window, List.of());
        assertTrue(json.contains("\"alerts\":[]"));
    }
}
