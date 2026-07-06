package com.fec.smartcity.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

import java.util.*;
import java.util.function.Supplier;
import java.util.stream.Collectors;

public class ZoneRepository {

    public static Object unwrapAttr(AttributeValue av) {
        return switch (av.type()) {
            case S -> av.s();
            case N -> Double.parseDouble(av.n());
            case BOOL -> av.bool();
            case L -> av.l().stream().map(ZoneRepository::unwrapAttr).collect(Collectors.toList());
            case M -> av.m().entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> unwrapAttr(e.getValue())));
            case NUL -> null;
            default -> null;
        };
    }

    public static Map<String, Object> unwrapItem(Map<String, AttributeValue> item) {
        Map<String, Object> out = new LinkedHashMap<>();
        item.forEach((k, v) -> out.put(k, unwrapAttr(v)));
        return out;
    }

    static Supplier<QueryRequest> latestByMetricQuery(String tableName, String metric, int limit) {
        return () -> QueryRequest.builder()
            .tableName(tableName)
            .keyConditionExpression("sensor_type = :st")
            .expressionAttributeValues(Map.of(":st", AttributeValue.fromS(metric)))
            .scanIndexForward(false)
            .limit(limit)
            .build();
    }

    public static List<Map<String, Object>> recentWindows(DynamoDbClient client, String tableName,
                                                             String metric, int limit) {
        QueryRequest request = latestByMetricQuery(tableName, metric, limit).get();
        LinkedList<Map<String, Object>> chronological = new LinkedList<>();
        for (var item : client.query(request).items()) {
            chronological.addFirst(unwrapItem(item));
        }
        return chronological;
    }

    public static Map<String, Object> buildZones(DynamoDbClient client, String tableName, String[] metrics) {
        Map<String, Map<String, Object>> byZone = new TreeMap<>();

        for (String metric : metrics) {
            List<Map<String, Object>> recent = recentWindows(client, tableName, metric, 20);
            Map<String, Map<String, Object>> latestPerZone = new LinkedHashMap<>();
            for (var item : recent) latestPerZone.put((String) item.get("site_id"), item);

            for (var entry : latestPerZone.entrySet()) {
                String zoneId = entry.getKey();
                Map<String, Object> item = entry.getValue();
                Map<String, Object> reading = new LinkedHashMap<>();
                reading.put("latest", item.get("latest"));
                reading.put("unit", item.get("unit"));
                reading.put("min", item.get("min"));
                reading.put("max", item.get("max"));
                reading.put("count", item.get("count"));
                reading.put("window_end", item.get("window_end"));
                reading.put("alerts", item.get("alerts"));
                byZone.computeIfAbsent(zoneId, z -> new LinkedHashMap<>()).put(metric, reading);
            }
        }

        List<Object> zones = new ArrayList<>();
        for (var entry : byZone.entrySet()) {
            Map<String, Object> zone = new LinkedHashMap<>();
            zone.put("zone_id", entry.getKey());
            zone.put("metrics", entry.getValue());
            zones.add(zone);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("zones", zones);
        return result;
    }
}
