package com.fec.industrial.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

import java.util.*;
import java.util.stream.Collectors;

public class DynamoHelper {

    public static Object unwrapAttr(AttributeValue av) {
        if (av.s() != null) return av.s();
        if (av.n() != null) return Double.parseDouble(av.n());
        if (av.hasL()) return av.l().stream().map(DynamoHelper::unwrapAttr).collect(Collectors.toList());
        return null;
    }

    public static Map<String, Object> unwrapItem(Map<String, AttributeValue> item) {
        Map<String, Object> out = new LinkedHashMap<>();
        item.forEach((k, v) -> out.put(k, unwrapAttr(v)));
        return out;
    }

    public static List<Map<String, Object>> recentWindows(DynamoDbClient client, String tableName,
                                                             String sensorType, int limit) {
        QueryRequest req = QueryRequest.builder()
            .tableName(tableName)
            .keyConditionExpression("sensor_type = :st")
            .expressionAttributeValues(Map.of(":st", AttributeValue.fromS(sensorType)))
            .scanIndexForward(false)
            .limit(limit)
            .build();
        List<Map<String, Object>> items = client.query(req).items().stream()
            .map(DynamoHelper::unwrapItem)
            .collect(Collectors.toList());
        Collections.reverse(items);
        return items;
    }

    public static Map<String, Object> buildSummary(DynamoDbClient client, String tableName, String[] sensorTypes) {
        List<Object> sensors = new ArrayList<>();
        for (String sensorType : sensorTypes) {
            List<Map<String, Object>> recent = recentWindows(client, tableName, sensorType, 20);
            Map<String, Map<String, Object>> bySite = new LinkedHashMap<>();
            for (var item : recent) bySite.put((String) item.get("site_id"), item);

            List<Object> sites = new ArrayList<>();
            List<String> siteIds = new ArrayList<>(bySite.keySet());
            Collections.sort(siteIds);
            for (String siteId : siteIds) {
                Map<String, Object> item = bySite.get(siteId);
                Map<String, Object> site = new LinkedHashMap<>();
                site.put("site_id", siteId);
                site.put("latest", item.get("latest"));
                site.put("unit", item.get("unit"));
                site.put("min", item.get("min"));
                site.put("max", item.get("max"));
                site.put("count", item.get("count"));
                site.put("window_end", item.get("window_end"));
                site.put("alerts", item.get("alerts"));
                sites.add(site);
            }
            Map<String, Object> sensor = new LinkedHashMap<>();
            sensor.put("sensor_type", sensorType);
            sensor.put("sites", sites);
            sensors.add(sensor);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sensors", sensors);
        return result;
    }
}
