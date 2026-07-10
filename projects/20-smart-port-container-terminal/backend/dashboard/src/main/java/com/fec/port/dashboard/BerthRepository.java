package com.fec.port.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** DynamoDB access: recent windows per sensor type, and the project-specific per-berth grouping view. */
class BerthRepository {

    static Object unwrap(AttributeValue av) {
        if (av.s() != null) return av.s();
        if (av.n() != null) return Double.parseDouble(av.n());
        if (av.hasL()) {
            List<Object> out = new ArrayList<>();
            for (AttributeValue element : av.l()) out.add(unwrap(element));
            return out;
        }
        return null;
    }

    static Map<String, Object> unwrapItem(Map<String, AttributeValue> item) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (var entry : item.entrySet()) out.put(entry.getKey(), unwrap(entry.getValue()));
        return out;
    }

    List<Map<String, Object>> recentWindows(DynamoDbClient client, String tableName, String sensorType, int limit) {
        QueryRequest request = QueryRequest.builder()
            .tableName(tableName)
            .keyConditionExpression("sensor_type = :st")
            .expressionAttributeValues(Map.of(":st", AttributeValue.fromS(sensorType)))
            .scanIndexForward(false)
            .limit(limit)
            .build();

        List<Map<String, Object>> items = new ArrayList<>();
        for (var item : client.query(request).items()) items.add(unwrapItem(item));
        Collections.reverse(items);
        return items;
    }

    /**
     * Project-specific per-berth grouping endpoint: for each sensor type,
     * the latest window reported by each site_id (berth), plus the
     * computed status_line -- see StatusLine.build().
     */
    Map<String, Object> byBerth(DynamoDbClient client, String tableName, String[] sensorTypes, int historyPerType) {
        Map<String, Map<String, Object>> berths = new TreeMap<>();
        for (String sensorType : sensorTypes) {
            List<Map<String, Object>> recent = recentWindows(client, tableName, sensorType, historyPerType);
            Map<String, List<Map<String, Object>>> bySite = new TreeMap<>();
            for (var item : recent) {
                bySite.computeIfAbsent((String) item.get("site_id"), s -> new ArrayList<>()).add(item);
            }
            for (var entry : bySite.entrySet()) {
                String siteId = entry.getKey();
                List<Map<String, Object>> history = entry.getValue();
                Map<String, Object> latest = history.get(history.size() - 1);

                Map<String, Object> metricEntry = new LinkedHashMap<>();
                metricEntry.put("unit", latest.get("unit"));
                metricEntry.put("latest", latest.get("latest"));
                metricEntry.put("min", latest.get("min"));
                metricEntry.put("max", latest.get("max"));
                metricEntry.put("avg", latest.get("avg"));
                metricEntry.put("count", latest.get("count"));
                metricEntry.put("window_end", latest.get("window_end"));
                metricEntry.put("alerts", latest.get("alerts"));

                Map<String, Object> berthEntry = berths.computeIfAbsent(siteId, s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("site_id", s);
                    m.put("metrics", new LinkedHashMap<String, Object>());
                    return m;
                });
                @SuppressWarnings("unchecked")
                Map<String, Object> metrics = (Map<String, Object>) berthEntry.get("metrics");
                metrics.put(sensorType, metricEntry);
            }
        }
        for (Map<String, Object> berthEntry : berths.values()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> metrics = (Map<String, Object>) berthEntry.get("metrics");
            berthEntry.put("status_line", segmentMaps(StatusLine.build(metrics)));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("berths", new ArrayList<>(berths.values()));
        return result;
    }

    private static List<Map<String, Object>> segmentMaps(List<StatusLine.Segment> segments) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (StatusLine.Segment segment : segments) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("label", segment.label());
            m.put("value", segment.value());
            m.put("active", segment.active());
            out.add(m);
        }
        return out;
    }
}
