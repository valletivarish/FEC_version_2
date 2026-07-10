package com.fec.mining.fog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class IngestPayloadTest {

    static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void parsesAValidPayload() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"methane_ppm\",\"site_id\":\"shaft-a\",\"unit\":\"ppm\"," +
            "\"readings\":[{\"ts\":\"t0\",\"value\":320.5}]}");
        IngestPayload payload = IngestPayload.parse(body);
        assertEquals("methane_ppm", payload.sensorType());
        assertEquals("shaft-a", payload.siteId());
        assertEquals("ppm", payload.unit());
        assertEquals(1, payload.readings().size());
        assertEquals(320.5, payload.readings().get(0).value());
    }

    @Test
    void defaultsSiteIdAndUnitWhenMissing() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"co_ppm\",\"readings\":[{\"value\":10.0}]}");
        IngestPayload payload = IngestPayload.parse(body);
        assertEquals("shaft-a", payload.siteId());
        assertEquals("", payload.unit());
    }

    @Test
    void rejectsNonObjectBody() throws Exception {
        var body = JSON.readTree("[1,2,3]");
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
    }

    @Test
    void rejectsMissingSensorType() throws Exception {
        var body = JSON.readTree("{\"readings\":[{\"value\":7.2}]}");
        var ex = assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
        assertTrue(ex.getMessage().contains("sensor_type"));
    }

    @Test
    void rejectsReadingsThatAreNotAnArray() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"co_ppm\",\"readings\":\"oops\"}");
        var ex = assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
        assertTrue(ex.getMessage().contains("readings"));
    }

    @Test
    void rejectsReadingWithoutNumericValue() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"co_ppm\",\"readings\":[{\"ts\":\"x\"}]}");
        var ex = assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
        assertTrue(ex.getMessage().contains("numeric value"));
    }
}
