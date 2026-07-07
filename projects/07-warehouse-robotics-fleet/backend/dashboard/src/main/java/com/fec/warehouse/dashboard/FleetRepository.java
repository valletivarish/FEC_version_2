package com.fec.warehouse.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class FleetRepository {

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

    public List<Map<String, Object>> recentWindows(DynamoDbClient client, String tableName, String sensorType, int limit) {
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
     * "Fleet roster" view: one row per (sensor_type, site_id), each carrying the
     * most recent window for that pair plus a short trailing history for the
     * inline sparkline. Grouped by robot/zone rather than by metric, since the
     * dashboard's primary axis is "what is this robot doing right now."
     */
    public Map<String, Object> buildRoster(DynamoDbClient client, String tableName, String[] sensorTypes, int historyLength) {
        List<Object> rows = new ArrayList<>();
        for (String sensorType : sensorTypes) {
            List<Map<String, Object>> recent = recentWindows(client, tableName, sensorType, historyLength * 4);
            Map<String, List<Map<String, Object>>> bySite = new TreeMap<>();
            for (var item : recent) {
                bySite.computeIfAbsent((String) item.get("site_id"), z -> new ArrayList<>()).add(item);
            }
            for (var entry : bySite.entrySet()) {
                List<Map<String, Object>> history = entry.getValue();
                Map<String, Object> latest = history.get(history.size() - 1);
                List<Map<String, Object>> trail = history.size() > historyLength
                    ? history.subList(history.size() - historyLength, history.size())
                    : history;

                Map<String, Object> row = new LinkedHashMap<>();
                row.put("sensor_type", sensorType);
                row.put("site_id", entry.getKey());
                row.put("unit", latest.get("unit"));
                row.put("latest", latest.get("latest"));
                row.put("min", latest.get("min"));
                row.put("max", latest.get("max"));
                row.put("avg", latest.get("avg"));
                row.put("count", latest.get("count"));
                row.put("window_end", latest.get("window_end"));
                row.put("alerts", latest.get("alerts"));
                row.put("trail", trail.stream().map(w -> w.get("avg")).toList());
                rows.add(row);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        return result;
    }
}
