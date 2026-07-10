package com.fec.port.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class BerthRepositoryTest {

    static Map<String, AttributeValue> item(String sensorType, String siteId, String windowEnd, double avg,
                                              double latest, List<String> alerts) {
        return Map.of(
            "sensor_type", AttributeValue.fromS(sensorType),
            "site_id", AttributeValue.fromS(siteId),
            "unit", AttributeValue.fromS("x"),
            "window_end", AttributeValue.fromS(windowEnd),
            "count", AttributeValue.fromN("3"),
            "min", AttributeValue.fromN("1.0"),
            "max", AttributeValue.fromN(String.valueOf(latest)),
            "avg", AttributeValue.fromN(String.valueOf(avg)),
            "latest", AttributeValue.fromN(String.valueOf(latest)),
            "alerts", AttributeValue.fromL(alerts.stream().map(AttributeValue::fromS).toList())
        );
    }

    @Test
    void recentWindowsReturnsChronologicalOrder() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(
            Map.of("crane_load_kg", List.of(
                item("crane_load_kg", "berth-a", "t2", 16000.0, 16500.0, List.of()),
                item("crane_load_kg", "berth-a", "t1", 15000.0, 15400.0, List.of()))), 0);

        var items = new BerthRepository().recentWindows(fake, "table", "crane_load_kg", 10);
        assertEquals("t1", items.get(0).get("window_end"));
        assertEquals("t2", items.get(1).get("window_end"));
    }

    @Test
    void byBerthGroupsMetricsUnderEachSiteId() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "crane_load_kg", List.of(
                item("crane_load_kg", "berth-a", "t1", 15000.0, 15400.0, List.of()),
                item("crane_load_kg", "berth-b", "t1", 16000.0, 16200.0, List.of())),
            "container_stack_height", List.of(item("container_stack_height", "berth-a", "t1", 4.0, 4.0, List.of()))
        ), 0);

        var result = new BerthRepository().byBerth(fake, "table", new String[]{"crane_load_kg", "container_stack_height"}, 5);
        @SuppressWarnings("unchecked")
        var berths = (List<Map<String, Object>>) result.get("berths");

        assertEquals(2, berths.size());
        var byId = berths.stream().collect(java.util.stream.Collectors.toMap(b -> b.get("site_id"), b -> b));
        assertTrue(byId.containsKey("berth-a"));
        assertTrue(byId.containsKey("berth-b"));

        @SuppressWarnings("unchecked")
        var berthAMetrics = (Map<String, Object>) byId.get("berth-a").get("metrics");
        assertTrue(berthAMetrics.containsKey("crane_load_kg"));
        assertTrue(berthAMetrics.containsKey("container_stack_height"));

        @SuppressWarnings("unchecked")
        var berthBMetrics = (Map<String, Object>) byId.get("berth-b").get("metrics");
        assertTrue(berthBMetrics.containsKey("crane_load_kg"));
        assertFalse(berthBMetrics.containsKey("container_stack_height"));
    }

    @Test
    void byBerthIncludesTheComputedStatusLine() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "crane_load_kg", List.of(item("crane_load_kg", "berth-a", "t1", 33000.0, 33500.0, List.of("crane_overload_risk")))
        ), 0);
        var result = new BerthRepository().byBerth(fake, "table", new String[]{"crane_load_kg"}, 5);
        @SuppressWarnings("unchecked")
        var berths = (List<Map<String, Object>>) result.get("berths");

        @SuppressWarnings("unchecked")
        var statusLine = (List<Map<String, Object>>) berths.get(0).get("status_line");
        assertEquals(4, statusLine.size());
        assertEquals("Crane", statusLine.get(0).get("label"));
        assertEquals("Overload Risk", statusLine.get(0).get("value"));
        assertEquals(true, statusLine.get(0).get("active"));
    }

    @Test
    void byBerthWithNoDataStillReturnsAnEmptyList() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(), 0);
        var result = new BerthRepository().byBerth(fake, "table", new String[]{"crane_load_kg"}, 5);
        @SuppressWarnings("unchecked")
        var berths = (List<Map<String, Object>>) result.get("berths");
        assertTrue(berths.isEmpty());
    }
}
