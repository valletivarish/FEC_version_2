package com.fec.transit.processor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pure transform from one fog-dispatched SQS message body into a DynamoDB
 * item. sort_key = windowEnd + "#" + siteId, so two depots reporting in the
 * same flush cycle never collide on the table's primary key.
 */
class RecordMapper {

    private static final ObjectMapper JSON = new ObjectMapper();

    static Map<String, AttributeValue> toItem(String messageBody) throws Exception {
        JsonNode data = JSON.readTree(messageBody);

        String sensorType = data.get("sensor_type").asText();
        String siteId = data.has("site_id") ? data.get("site_id").asText() : "depot-a";
        String windowEnd = data.get("window_end").asText();
        String sortKey = windowEnd + "#" + siteId;

        List<AttributeValue> alerts = new ArrayList<>();
        if (data.has("alerts")) {
            for (JsonNode alert : data.get("alerts")) alerts.add(AttributeValue.fromS(alert.asText()));
        }

        Map<String, AttributeValue> item = new LinkedHashMap<>();
        item.put("sensor_type", AttributeValue.fromS(sensorType));
        item.put("sort_key", AttributeValue.fromS(sortKey));
        item.put("site_id", AttributeValue.fromS(siteId));
        item.put("unit", AttributeValue.fromS(data.has("unit") ? data.get("unit").asText() : ""));
        item.put("window_start", AttributeValue.fromS(data.get("window_start").asText()));
        item.put("window_end", AttributeValue.fromS(windowEnd));
        item.put("count", AttributeValue.fromN(String.valueOf(data.get("count").asInt())));
        item.put("min", AttributeValue.fromN(String.valueOf(data.get("min").asDouble())));
        item.put("max", AttributeValue.fromN(String.valueOf(data.get("max").asDouble())));
        item.put("avg", AttributeValue.fromN(String.valueOf(data.get("avg").asDouble())));
        item.put("latest", AttributeValue.fromN(String.valueOf(data.get("latest").asDouble())));
        item.put("alerts", AttributeValue.fromL(alerts));
        return item;
    }
}
