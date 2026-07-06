package com.fec.industrial.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class DynamoHelperTest {

    static Map<String, AttributeValue> item(String sensorType, String siteId, String windowEnd,
                                              double latest, double min, double max, int count, List<String> alerts) {
        Map<String, AttributeValue> m = new HashMap<>();
        m.put("sensor_type", AttributeValue.fromS(sensorType));
        m.put("site_id", AttributeValue.fromS(siteId));
        m.put("window_end", AttributeValue.fromS(windowEnd));
        m.put("unit", AttributeValue.fromS("mm/s"));
        m.put("latest", AttributeValue.fromN(String.valueOf(latest)));
        m.put("min", AttributeValue.fromN(String.valueOf(min)));
        m.put("max", AttributeValue.fromN(String.valueOf(max)));
        m.put("count", AttributeValue.fromN(String.valueOf(count)));
        List<AttributeValue> alertVals = new ArrayList<>();
        alerts.forEach(a -> alertVals.add(AttributeValue.fromS(a)));
        m.put("alerts", AttributeValue.fromL(alertVals));
        return m;
    }

    @Test
    void recentWindowsReversesToChronologicalOrder() {
        // DynamoDB (ScanIndexForward=false) returns newest first
        var items = List.of(
            item("vibration", "line-1", "e2", 8.0, 7.0, 9.0, 4, List.of()),
            item("vibration", "line-1", "e1", 2.0, 1.0, 3.0, 4, List.of())
        );
        var client = new FakeDynamoDbClient(Map.of("vibration", items), 0);

        var result = DynamoHelper.recentWindows(client, "table", "vibration", 20);
        assertEquals("e1", result.get(0).get("window_end"));
        assertEquals("e2", result.get(1).get("window_end"));
    }

    @Test
    void buildSummaryGroupsByLatestItemPerSite() {
        var vibrationItems = List.of(
            item("vibration", "line-1", "e2", 8.0, 7.0, 9.0, 4, List.of("bearing_wear_risk")),
            item("vibration", "line-1", "e1", 2.0, 1.0, 3.0, 4, List.of())
        );
        var client = new FakeDynamoDbClient(Map.of("vibration", vibrationItems), 0);

        var summary = DynamoHelper.buildSummary(client, "table", new String[]{"vibration", "power_draw"});
        List<?> sensors = (List<?>) summary.get("sensors");
        Map<?, ?> vibrationSensor = (Map<?, ?>) sensors.get(0);
        assertEquals("vibration", vibrationSensor.get("sensor_type"));
        List<?> sites = (List<?>) vibrationSensor.get("sites");
        Map<?, ?> site = (Map<?, ?>) sites.get(0);
        assertEquals("line-1", site.get("site_id"));
        assertEquals(8.0, site.get("latest"));
        assertEquals(List.of("bearing_wear_risk"), site.get("alerts"));

        Map<?, ?> powerDrawSensor = (Map<?, ?>) sensors.get(1);
        assertTrue(((List<?>) powerDrawSensor.get("sites")).isEmpty());
    }

    @Test
    void buildSummarySeparatesMultipleSites() {
        var items = List.of(
            item("vibration", "line-2", "e1", 8.0, 7.0, 9.0, 4, List.of("bearing_wear_risk")),
            item("vibration", "line-1", "e1", 2.0, 1.0, 3.0, 4, List.of())
        );
        var client = new FakeDynamoDbClient(Map.of("vibration", items), 0);

        var summary = DynamoHelper.buildSummary(client, "table", new String[]{"vibration"});
        List<?> sites = (List<?>) ((Map<?, ?>) ((List<?>) summary.get("sensors")).get(0)).get("sites");
        assertEquals(2, sites.size());
        assertEquals("line-1", ((Map<?, ?>) sites.get(0)).get("site_id"));
        assertEquals("line-2", ((Map<?, ?>) sites.get(1)).get("site_id"));
    }
}
