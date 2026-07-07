package com.fec.warehouse.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class FleetRepositoryTest {

    static Map<String, AttributeValue> item(String siteId, String windowEnd, double avg, double latest) {
        return Map.of(
            "sensor_type", AttributeValue.fromS("motor_temp_c"),
            "site_id", AttributeValue.fromS(siteId),
            "unit", AttributeValue.fromS("C"),
            "window_end", AttributeValue.fromS(windowEnd),
            "count", AttributeValue.fromN("3"),
            "min", AttributeValue.fromN("40.0"),
            "max", AttributeValue.fromN("60.0"),
            "avg", AttributeValue.fromN(String.valueOf(avg)),
            "latest", AttributeValue.fromN(String.valueOf(latest)),
            "alerts", AttributeValue.fromL(List.of())
        );
    }

    @Test
    void recentWindowsReturnsChronologicalOrder() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(
            Map.of("motor_temp_c", List.of(item("zone-a", "t2", 55, 55), item("zone-a", "t1", 45, 45))), 0);

        var items = new FleetRepository().recentWindows(fake, "table", "motor_temp_c", 10);
        assertEquals("t1", items.get(0).get("window_end"));
        assertEquals("t2", items.get(1).get("window_end"));
    }

    @Test
    void buildRosterGroupsBySiteWithinSensorType() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(
            Map.of("motor_temp_c", List.of(item("zone-b", "t1", 50, 50), item("zone-a", "t1", 40, 40))), 0);

        var roster = new FleetRepository().buildRoster(fake, "table", new String[]{"motor_temp_c"}, 5);
        @SuppressWarnings("unchecked")
        var rows = (List<Map<String, Object>>) roster.get("rows");

        assertEquals(2, rows.size());
        var siteIds = rows.stream().map(r -> r.get("site_id")).toList();
        assertTrue(siteIds.contains("zone-a"));
        assertTrue(siteIds.contains("zone-b"));
    }

    @Test
    void buildRosterIncludesTrailForSparkline() {
        // DynamoDB returns newest-first (scanIndexForward=false); the fake mirrors that ordering.
        FakeDynamoDbClient fake = new FakeDynamoDbClient(
            Map.of("battery_level_pct", List.of(item("zone-a", "t2", 75, 75), item("zone-a", "t1", 80, 80))), 0);

        var roster = new FleetRepository().buildRoster(fake, "table", new String[]{"battery_level_pct"}, 5);
        @SuppressWarnings("unchecked")
        var rows = (List<Map<String, Object>>) roster.get("rows");

        assertEquals(1, rows.size());
        @SuppressWarnings("unchecked")
        var trail = (List<Object>) rows.get(0).get("trail");
        assertEquals(2, trail.size());
        assertEquals(75.0, rows.get(0).get("latest"));
    }

    @Test
    void buildRosterSkipsSensorTypesWithNoData() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(), 0);
        var roster = new FleetRepository().buildRoster(fake, "table", new String[]{"payload_kg"}, 5);
        @SuppressWarnings("unchecked")
        var rows = (List<Map<String, Object>>) roster.get("rows");
        assertTrue(rows.isEmpty());
    }
}
