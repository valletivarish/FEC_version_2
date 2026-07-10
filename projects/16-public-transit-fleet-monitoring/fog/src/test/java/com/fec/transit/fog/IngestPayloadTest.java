package com.fec.transit.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class IngestPayloadTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static JsonNode tree(String json) throws Exception {
        return JSON.readTree(json);
    }

    @Test
    void parsesAWellFormedPayload() throws Exception {
        IngestPayload payload = IngestPayload.parse(tree(
            "{\"sensor_type\":\"engine_temp_c\",\"site_id\":\"depot-a\",\"unit\":\"C\",\"readings\":[{\"value\":88.0},{\"value\":90.5}]}"));

        assertEquals("engine_temp_c", payload.sensorType());
        assertEquals("depot-a", payload.siteId());
        assertEquals("C", payload.unit());
        assertEquals(2, payload.values().size());
    }

    @Test
    void missingSiteIdDefaultsToDepotA() throws Exception {
        IngestPayload payload = IngestPayload.parse(tree(
            "{\"sensor_type\":\"gps_speed_kmh\",\"readings\":[{\"value\":40.0}]}"));
        assertEquals("depot-a", payload.siteId());
    }

    @Test
    void nonObjectBodyIsRejected() {
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(tree("[1,2,3]")));
    }

    @Test
    void missingSensorTypeIsRejected() {
        assertThrows(IngestPayload.ValidationException.class,
            () -> IngestPayload.parse(tree("{\"readings\":[{\"value\":1.0}]}")));
    }

    @Test
    void blankSensorTypeIsRejected() {
        assertThrows(IngestPayload.ValidationException.class,
            () -> IngestPayload.parse(tree("{\"sensor_type\":\"\",\"readings\":[{\"value\":1.0}]}")));
    }

    @Test
    void readingsNotAnArrayIsRejected() {
        assertThrows(IngestPayload.ValidationException.class,
            () -> IngestPayload.parse(tree("{\"sensor_type\":\"fuel_level_pct\",\"readings\":\"oops\"}")));
    }

    @Test
    void missingReadingsFieldIsRejected() {
        assertThrows(IngestPayload.ValidationException.class,
            () -> IngestPayload.parse(tree("{\"sensor_type\":\"fuel_level_pct\"}")));
    }

    @Test
    void readingMissingNumericValueIsRejected() {
        assertThrows(IngestPayload.ValidationException.class,
            () -> IngestPayload.parse(tree("{\"sensor_type\":\"fuel_level_pct\",\"readings\":[{\"ts\":\"x\"}]}")));
    }

    @Test
    void readingWithNonNumericValueIsRejected() {
        assertThrows(IngestPayload.ValidationException.class,
            () -> IngestPayload.parse(tree("{\"sensor_type\":\"fuel_level_pct\",\"readings\":[{\"value\":\"high\"}]}")));
    }
}
