package com.fec.mining.fog;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;

/**
 * Builds the SQS message body for one window's aggregate.
 *
 * Every other Java fog sibling builds this exact payload differently: 02
 * and 16 hand-build a blank ObjectNode field-by-field with .put() calls; 04
 * and 08 serialize a POJO straight to a JSON string via
 * ObjectMapper.writeValueAsString() (nothing ever touches a tree); 09
 * writes the JSON token-by-token through Jackson's low-level JsonGenerator
 * streaming API (no tree, no POJO); 07 goes through a bespoke fluent
 * JsonBuilder wrapper class. This uses a hybrid of none of those: the
 * numeric/string fields are described once as an annotated record
 * (SafetyAggregatePayload) and turned into a JsonNode tree via
 * ObjectMapper.valueToTree() -- POJO-to-tree, not POJO-to-string -- and the
 * alerts array, which the payload record deliberately omits, is appended
 * onto that already-built tree afterwards with putArray()/add().
 */
public class PayloadJson {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    record SafetyAggregatePayload(
        @JsonProperty("sensor_type") String sensorType,
        @JsonProperty("site_id") String siteId,
        @JsonProperty("unit") String unit,
        @JsonProperty("window_start") String windowStart,
        @JsonProperty("window_end") String windowEnd,
        @JsonProperty("count") int count,
        @JsonProperty("min") double min,
        @JsonProperty("max") double max,
        @JsonProperty("avg") double avg,
        @JsonProperty("latest") double latest
    ) {
        static SafetyAggregatePayload from(WindowAggregate w) {
            return new SafetyAggregatePayload(w.sensorType(), w.siteId(), w.unit(), w.windowStart(), w.windowEnd(),
                w.count(), w.min(), w.max(), w.avg(), w.latest());
        }
    }

    public static String toJson(WindowAggregate window, List<String> alerts) {
        ObjectNode node = (ObjectNode) MAPPER.valueToTree(SafetyAggregatePayload.from(window));
        ArrayNode alertsArray = node.putArray("alerts");
        alerts.forEach(alertsArray::add);
        return node.toString();
    }
}
