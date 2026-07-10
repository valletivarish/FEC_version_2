package com.fec.port.fog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class IngestValidationTest {

    static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void parsesAWellFormedPayload() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"crane_load_kg\",\"site_id\":\"berth-a\",\"unit\":\"kg\"," +
            "\"readings\":[{\"ts\":\"t0\",\"value\":15000.5}]}");
        IngestValidation parsed = IngestValidation.parse(body);
        assertEquals("crane_load_kg", parsed.sensorType());
        assertEquals("berth-a", parsed.siteId());
        assertEquals("kg", parsed.unit());
        assertEquals(1, parsed.readings().size());
        assertEquals(15000.5, parsed.readings().get(0).value());
    }

    @Test
    void defaultsSiteIdAndUnitWhenMissing() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"wind_speed_knots\",\"readings\":[{\"value\":10.0}]}");
        IngestValidation parsed = IngestValidation.parse(body);
        assertEquals("berth-a", parsed.siteId());
        assertEquals("", parsed.unit());
    }

    @Test
    void rejectsNonObjectBody() throws Exception {
        var body = JSON.readTree("\"just a string\"");
        assertThrows(IngestValidation.ValidationException.class, () -> IngestValidation.parse(body));
    }

    @Test
    void rejectsMissingSensorType() throws Exception {
        var body = JSON.readTree("{\"readings\":[{\"value\":1.0}]}");
        var exc = assertThrows(IngestValidation.ValidationException.class, () -> IngestValidation.parse(body));
        assertTrue(exc.getMessage().contains("sensor_type"));
    }

    @Test
    void rejectsReadingsThatAreNotAnArray() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"reefer_temp_c\",\"readings\":\"oops\"}");
        var exc = assertThrows(IngestValidation.ValidationException.class, () -> IngestValidation.parse(body));
        assertTrue(exc.getMessage().contains("readings"));
    }

    @Test
    void rejectsAReadingMissingNumericValue() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"reefer_temp_c\",\"readings\":[{\"ts\":\"t0\"}]}");
        var exc = assertThrows(IngestValidation.ValidationException.class, () -> IngestValidation.parse(body));
        assertTrue(exc.getMessage().contains("numeric value"));
    }

    @Test
    void generatesATimestampWhenOneIsNotProvided() throws Exception {
        var body = JSON.readTree("{\"sensor_type\":\"berth_occupancy_pct\",\"readings\":[{\"value\":50.0}]}");
        IngestValidation parsed = IngestValidation.parse(body);
        assertNotNull(parsed.readings().get(0).ts());
        assertFalse(parsed.readings().get(0).ts().isBlank());
    }
}
