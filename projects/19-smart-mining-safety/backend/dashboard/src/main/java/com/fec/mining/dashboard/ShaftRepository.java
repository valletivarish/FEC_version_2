package com.fec.mining.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** DynamoDB access: recent windows per sensor type, and the per-shaft safety-classification grouping view. */
class ShaftRepository {

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
     * SAFE/CAUTION/DANGER classification for one shaft, computed from its
     * latest window per alert-bearing sensor type: DANGER if any of the 4
     * real fired-alert lists is non-empty; else CAUTION if any of the 4
     * readings' latest window average is at or above 75% of its alert
     * threshold; else SAFE. ambient_temp_c is excluded (no alert rule).
     */
    static String classify(Map<String, Object> metrics) {
        boolean danger = false;
        boolean caution = false;
        for (var entry : SafetyLimits.LIMITS.entrySet()) {
            Object metric = metrics.get(entry.getKey());
            if (!(metric instanceof Map)) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) metric;

            Object alertsObj = m.get("alerts");
            if (alertsObj instanceof List<?> alerts && !alerts.isEmpty()) danger = true;

            Object avgObj = m.get("avg");
            if (avgObj instanceof Number avgNum && avgNum.doubleValue() >= entry.getValue() * SafetyLimits.CAUTION_RATIO) {
                caution = true;
            }
        }
        if (danger) return "DANGER";
        if (caution) return "CAUTION";
        return "SAFE";
    }

    /**
     * Per-shaft grouping endpoint: for each sensor type, the latest window
     * reported by each site_id (shaft), plus the computed safety status.
     * Distinct from 16's per-depot vehicle-type-card grouping and 09's
     * per-pond ring cards in shape only insofar as the domain requires: the
     * shaft is the section, each sensor type is a metric row inside it, and
     * a top-level "status" field carries the SAFE/CAUTION/DANGER verdict
     * the primary dashboard view reads directly.
     */
    Map<String, Object> byShaft(DynamoDbClient client, String tableName, String[] sensorTypes, int historyPerType) {
        Map<String, Map<String, Object>> shafts = new TreeMap<>();
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

                Map<String, Object> shaftEntry = shafts.computeIfAbsent(siteId, s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("site_id", s);
                    m.put("metrics", new LinkedHashMap<String, Object>());
                    return m;
                });
                @SuppressWarnings("unchecked")
                Map<String, Object> metrics = (Map<String, Object>) shaftEntry.get("metrics");
                metrics.put(sensorType, metricEntry);
            }
        }
        for (Map<String, Object> shaftEntry : shafts.values()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> metrics = (Map<String, Object>) shaftEntry.get("metrics");
            shaftEntry.put("status", classify(metrics));
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("shafts", new ArrayList<>(shafts.values()));
        return result;
    }
}
