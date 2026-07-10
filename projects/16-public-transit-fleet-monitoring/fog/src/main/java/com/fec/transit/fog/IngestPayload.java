package com.fec.transit.fog;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

/**
 * Parses and validates an /ingest request body. Rejects malformed or
 * missing-field payloads with a descriptive reason instead of throwing an
 * unchecked NPE deep in field access -- the caller turns a non-null
 * rejection reason into a 400 response.
 */
record IngestPayload(String sensorType, String siteId, String unit, List<Double> values) {

    static final class ValidationException extends RuntimeException {
        ValidationException(String message) {
            super(message);
        }
    }

    static IngestPayload parse(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new ValidationException("request body must be a JSON object");
        }
        if (!body.hasNonNull("sensor_type") || body.get("sensor_type").asText().isBlank()) {
            throw new ValidationException("sensor_type is required");
        }
        if (!body.has("readings") || !body.get("readings").isArray()) {
            throw new ValidationException("readings must be a JSON array");
        }
        String sensorType = body.get("sensor_type").asText();
        String siteId = body.has("site_id") && !body.get("site_id").isNull() ? body.get("site_id").asText() : "depot-a";
        String unit = body.has("unit") && !body.get("unit").isNull() ? body.get("unit").asText() : "";

        List<Double> values = new ArrayList<>();
        for (JsonNode reading : body.get("readings")) {
            if (!reading.isObject() || !reading.hasNonNull("value") || !reading.get("value").isNumber()) {
                throw new ValidationException("each reading requires a numeric value field");
            }
            values.add(reading.get("value").asDouble());
        }
        return new IngestPayload(sensorType, siteId, unit, values);
    }
}
