package com.fec.aquaculture.fog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class IngestPayloadTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void parsesAWellFormedPayload() throws Exception {
        var body = JSON.readTree("""
            {"sensor_type":"ph_level","site_id":"pond-2","unit":"pH",
             "readings":[{"ts":"t1","value":7.1},{"ts":"t2","value":7.3}]}
            """);
        IngestPayload payload = IngestPayload.parse(body);
        assertEquals("ph_level", payload.sensorType());
        assertEquals("pond-2", payload.siteId());
        assertEquals("pH", payload.unit());
        assertEquals(2, payload.values().size());
    }

    @Test
    void defaultsSiteIdAndUnitWhenMissing() throws Exception {
        var body = JSON.readTree("""
            {"sensor_type":"water_temp_c","readings":[{"ts":"t1","value":24.0}]}
            """);
        IngestPayload payload = IngestPayload.parse(body);
        assertEquals("pond-1", payload.siteId());
        assertEquals("", payload.unit());
    }

    @Test
    void rejectsMissingSensorType() throws Exception {
        var body = JSON.readTree("""
            {"readings":[{"ts":"t1","value":1.0}]}
            """);
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
    }

    @Test
    void rejectsBlankSensorType() throws Exception {
        var body = JSON.readTree("""
            {"sensor_type":"","readings":[{"ts":"t1","value":1.0}]}
            """);
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
    }

    @Test
    void rejectsMissingReadingsArray() throws Exception {
        var body = JSON.readTree("""
            {"sensor_type":"ph_level"}
            """);
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
    }

    @Test
    void rejectsReadingsThatIsNotAnArray() throws Exception {
        var body = JSON.readTree("""
            {"sensor_type":"ph_level","readings":"nope"}
            """);
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
    }

    @Test
    void rejectsReadingWithMissingValueField() throws Exception {
        var body = JSON.readTree("""
            {"sensor_type":"ph_level","readings":[{"ts":"t1"}]}
            """);
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
    }

    @Test
    void rejectsReadingWithNonNumericValue() throws Exception {
        var body = JSON.readTree("""
            {"sensor_type":"ph_level","readings":[{"ts":"t1","value":"warm"}]}
            """);
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
    }

    @Test
    void rejectsNonObjectBody() throws Exception {
        var body = JSON.readTree("[1,2,3]");
        assertThrows(IngestPayload.ValidationException.class, () -> IngestPayload.parse(body));
    }
}
