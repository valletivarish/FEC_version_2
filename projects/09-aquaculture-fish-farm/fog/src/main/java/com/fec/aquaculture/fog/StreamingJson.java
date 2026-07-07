package com.fec.aquaculture.fog;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;

import java.io.IOException;
import java.io.StringWriter;
import java.util.List;
import java.util.Map;

/**
 * Writes JSON through Jackson's low-level streaming API (JsonFactory +
 * JsonGenerator) instead of building a tree (ObjectNode, as in 02 and 07's
 * JsonBuilder) or data-binding a POJO/record via writeValueAsString (as in
 * 04's private record and 08's @JsonPropertyOrder DTOs). Every field is
 * written directly to the output stream one token at a time -- there is no
 * intermediate tree or object graph held in memory at all.
 */
final class StreamingJson {

    private static final JsonFactory FACTORY = new JsonFactory();

    private StreamingJson() {}

    static String aggregatePayload(WindowAggregate window, List<String> alerts) {
        StringWriter writer = new StringWriter();
        try (JsonGenerator gen = FACTORY.createGenerator(writer)) {
            gen.writeStartObject();
            gen.writeStringField("sensor_type", window.sensorType());
            gen.writeStringField("site_id", window.siteId());
            gen.writeStringField("unit", window.unit());
            gen.writeStringField("window_start", window.windowStart());
            gen.writeStringField("window_end", window.windowEnd());
            gen.writeNumberField("count", window.count());
            gen.writeNumberField("min", window.min());
            gen.writeNumberField("max", window.max());
            gen.writeNumberField("avg", window.avg());
            gen.writeNumberField("latest", window.latest());
            gen.writeArrayFieldStart("alerts");
            for (String alert : alerts) gen.writeString(alert);
            gen.writeEndArray();
            gen.writeEndObject();
        } catch (IOException e) {
            throw new UncheckedJsonException(e);
        }
        return writer.toString();
    }

    static String thresholdsPayload(Map<String, List<Rule>> bySensorType) {
        StringWriter writer = new StringWriter();
        try (JsonGenerator gen = FACTORY.createGenerator(writer)) {
            gen.writeStartObject();
            for (var entry : bySensorType.entrySet()) {
                gen.writeArrayFieldStart(entry.getKey());
                for (Rule rule : entry.getValue()) {
                    gen.writeStartObject();
                    gen.writeStringField("field", rule.field());
                    gen.writeStringField("op", rule.op());
                    gen.writeNumberField("limit", rule.limit());
                    gen.writeStringField("key", rule.key());
                    gen.writeEndObject();
                }
                gen.writeEndArray();
            }
            gen.writeEndObject();
        } catch (IOException e) {
            throw new UncheckedJsonException(e);
        }
        return writer.toString();
    }

    static String status(String status) {
        StringWriter writer = new StringWriter();
        try (JsonGenerator gen = FACTORY.createGenerator(writer)) {
            gen.writeStartObject();
            gen.writeStringField("status", status);
            gen.writeEndObject();
        } catch (IOException e) {
            throw new UncheckedJsonException(e);
        }
        return writer.toString();
    }

    static String accepted(int count) {
        StringWriter writer = new StringWriter();
        try (JsonGenerator gen = FACTORY.createGenerator(writer)) {
            gen.writeStartObject();
            gen.writeNumberField("accepted", count);
            gen.writeEndObject();
        } catch (IOException e) {
            throw new UncheckedJsonException(e);
        }
        return writer.toString();
    }

    static String error(String message) {
        StringWriter writer = new StringWriter();
        try (JsonGenerator gen = FACTORY.createGenerator(writer)) {
            gen.writeStartObject();
            gen.writeStringField("error", message);
            gen.writeEndObject();
        } catch (IOException e) {
            throw new UncheckedJsonException(e);
        }
        return writer.toString();
    }

    static final class UncheckedJsonException extends RuntimeException {
        UncheckedJsonException(IOException cause) {
            super(cause);
        }
    }
}
