package com.fec.mining.fog;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;

/** Builds the SQS payload by converting an annotated record to a JsonNode tree via ObjectMapper.valueToTree(), then appends the alerts array with putArray()/add(). */
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
