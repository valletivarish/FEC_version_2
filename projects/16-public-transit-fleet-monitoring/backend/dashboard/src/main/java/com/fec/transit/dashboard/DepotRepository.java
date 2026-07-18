package com.fec.transit.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** DynamoDB access: recent windows per sensor type, and the per-depot roster view. */
class DepotRepository {

    static Object decodeAttribute(AttributeValue av) {
        if (av.s() != null) return av.s();
        if (av.n() != null) return Double.parseDouble(av.n());
        if (av.hasL()) {
            List<Object> out = new ArrayList<>();
            for (AttributeValue element : av.l()) out.add(decodeAttribute(element));
            return out;
        }
        return null;
    }

    static Map<String, Object> decodeItem(Map<String, AttributeValue> item) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (var entry : item.entrySet()) out.put(entry.getKey(), decodeAttribute(entry.getValue()));
        return out;
    }

    List<Map<String, Object>> recentSensorWindows(DynamoDbClient client, String tableName, String sensorType, int limit) {
        QueryRequest request = QueryRequest.builder()
            .tableName(tableName)
            .keyConditionExpression("sensor_type = :st")
            .expressionAttributeValues(Map.of(":st", AttributeValue.fromS(sensorType)))
            .scanIndexForward(false)
            .limit(limit)
            .build();

        List<Map<String, Object>> windows = new ArrayList<>();
        for (var item : client.query(request).items()) windows.add(decodeItem(item));
        Collections.reverse(windows);
        return windows;
    }

    /** Per-depot roster view keyed by site_id, with each vehicle/sensor type as a nested summary card. */
    Map<String, Object> depotRoster(DynamoDbClient client, String tableName, String[] sensorTypes, int historyPerType) {
        Map<String, Map<String, Object>> roster = new TreeMap<>();
        for (String sensorType : sensorTypes) {
            List<Map<String, Object>> recent = recentSensorWindows(client, tableName, sensorType, historyPerType);
            Map<String, List<Map<String, Object>>> byDepot = new TreeMap<>();
            for (var item : recent) {
                byDepot.computeIfAbsent((String) item.get("site_id"), s -> new ArrayList<>()).add(item);
            }
            for (var entry : byDepot.entrySet()) {
                String siteId = entry.getKey();
                List<Map<String, Object>> history = entry.getValue();
                Map<String, Object> latest = history.get(history.size() - 1);

                Map<String, Object> metricSummary = new LinkedHashMap<>();
                metricSummary.put("unit", latest.get("unit"));
                metricSummary.put("latest", latest.get("latest"));
                metricSummary.put("min", latest.get("min"));
                metricSummary.put("max", latest.get("max"));
                metricSummary.put("avg", latest.get("avg"));
                metricSummary.put("count", latest.get("count"));
                metricSummary.put("window_end", latest.get("window_end"));
                metricSummary.put("alerts", latest.get("alerts"));

                Map<String, Object> depotCard = roster.computeIfAbsent(siteId, s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("site_id", s);
                    m.put("metrics", new LinkedHashMap<String, Object>());
                    return m;
                });
                @SuppressWarnings("unchecked")
                Map<String, Object> metricMap = (Map<String, Object>) depotCard.get("metrics");
                metricMap.put(sensorType, metricSummary);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("depots", new ArrayList<>(roster.values()));
        return result;
    }
}
