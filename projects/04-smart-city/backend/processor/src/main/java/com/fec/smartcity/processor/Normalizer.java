package com.fec.smartcity.processor;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class Normalizer {

    private static final String FALLBACK_ZONE = "zone-1";
    private static final ObjectMapper JSON = new ObjectMapper();

    public static Map<String, AttributeValue> normalize(String messageBody) throws Exception {
        Map<String, Object> decoded = JSON.readValue(messageBody, new TypeReference<LinkedHashMap<String, Object>>() {});

        Object rawZone = decoded.get("site_id");
        String zoneId = rawZone == null ? FALLBACK_ZONE : String.valueOf(rawZone);
        String windowEnd = String.valueOf(decoded.get("window_end"));

        decoded.put("site_id", zoneId);
        decoded.put("sort_key", windowEnd + "#" + zoneId);
        decoded.putIfAbsent("unit", "");
        decoded.putIfAbsent("alerts", new ArrayList<>());

        Map<String, AttributeValue> attrs = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : decoded.entrySet()) {
            attrs.put(entry.getKey(), toAttr(entry.getValue()));
        }
        return attrs;
    }

    @SuppressWarnings("unchecked")
    private static AttributeValue toAttr(Object value) {
        if (value == null) {
            return AttributeValue.fromNul(true);
        }
        if (value instanceof String s) {
            return AttributeValue.fromS(s);
        }
        if (value instanceof Number n) {
            return AttributeValue.fromN(String.valueOf(n));
        }
        if (value instanceof Boolean b) {
            return AttributeValue.fromBool(b);
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, AttributeValue> nested = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : map.entrySet()) {
                nested.put(String.valueOf(e.getKey()), toAttr(e.getValue()));
            }
            return AttributeValue.fromM(nested);
        }
        if (value instanceof List<?> list) {
            List<AttributeValue> nested = new ArrayList<>();
            for (Object element : list) {
                nested.add(toAttr(element));
            }
            return AttributeValue.fromL(nested);
        }
        return AttributeValue.fromS(String.valueOf(value));
    }
}
