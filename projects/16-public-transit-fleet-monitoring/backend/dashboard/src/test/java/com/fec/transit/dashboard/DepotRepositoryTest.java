package com.fec.transit.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DepotRepositoryTest {

    static Map<String, AttributeValue> item(String sensorType, String siteId, String windowEnd, double avg, double latest) {
        return Map.of(
            "sensor_type", AttributeValue.fromS(sensorType),
            "site_id", AttributeValue.fromS(siteId),
            "unit", AttributeValue.fromS("x"),
            "window_end", AttributeValue.fromS(windowEnd),
            "count", AttributeValue.fromN("3"),
            "min", AttributeValue.fromN("1.0"),
            "max", AttributeValue.fromN("9.0"),
            "avg", AttributeValue.fromN(String.valueOf(avg)),
            "latest", AttributeValue.fromN(String.valueOf(latest)),
            "alerts", AttributeValue.fromL(List.of())
        );
    }

    @Test
    void recentWindowsReturnsChronologicalOrder() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(
            Map.of("engine_temp_c", List.of(item("engine_temp_c", "depot-a", "t2", 90.0, 90.0), item("engine_temp_c", "depot-a", "t1", 88.0, 88.0))), 0);

        var items = new DepotRepository().recentWindows(fake, "table", "engine_temp_c", 10);
        assertEquals("t1", items.get(0).get("window_end"));
        assertEquals("t2", items.get(1).get("window_end"));
    }

    @Test
    void byDepotGroupsMetricsUnderEachDepotId() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "engine_temp_c", List.of(item("engine_temp_c", "depot-a", "t1", 88.0, 88.0), item("engine_temp_c", "depot-b", "t1", 91.0, 91.0)),
            "fuel_level_pct", List.of(item("fuel_level_pct", "depot-a", "t1", 65.0, 65.0))
        ), 0);

        var result = new DepotRepository().byDepot(fake, "table", new String[]{"engine_temp_c", "fuel_level_pct"}, 5);
        @SuppressWarnings("unchecked")
        var depots = (List<Map<String, Object>>) result.get("depots");

        assertEquals(2, depots.size());
        var byId = depots.stream().collect(java.util.stream.Collectors.toMap(s -> s.get("site_id"), s -> s));
        assertTrue(byId.containsKey("depot-a"));
        assertTrue(byId.containsKey("depot-b"));

        @SuppressWarnings("unchecked")
        var depotAMetrics = (Map<String, Object>) byId.get("depot-a").get("metrics");
        assertTrue(depotAMetrics.containsKey("engine_temp_c"));
        assertTrue(depotAMetrics.containsKey("fuel_level_pct"));

        @SuppressWarnings("unchecked")
        var depotBMetrics = (Map<String, Object>) byId.get("depot-b").get("metrics");
        assertTrue(depotBMetrics.containsKey("engine_temp_c"));
        assertFalse(depotBMetrics.containsKey("fuel_level_pct"));
    }

    @Test
    void byDepotProducesDistinctValuesPerDepot() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "passenger_count", List.of(item("passenger_count", "depot-a", "t1", 40.0, 40.0), item("passenger_count", "depot-b", "t1", 78.0, 78.0))
        ), 0);

        var result = new DepotRepository().byDepot(fake, "table", new String[]{"passenger_count"}, 5);
        @SuppressWarnings("unchecked")
        var depots = (List<Map<String, Object>>) result.get("depots");
        var byId = depots.stream().collect(java.util.stream.Collectors.toMap(s -> s.get("site_id"), s -> s));

        @SuppressWarnings("unchecked")
        var depotAMetric = (Map<String, Object>) ((Map<String, Object>) byId.get("depot-a").get("metrics")).get("passenger_count");
        @SuppressWarnings("unchecked")
        var depotBMetric = (Map<String, Object>) ((Map<String, Object>) byId.get("depot-b").get("metrics")).get("passenger_count");

        assertEquals(40.0, depotAMetric.get("avg"));
        assertEquals(78.0, depotBMetric.get("avg"));
        assertNotEquals(depotAMetric.get("avg"), depotBMetric.get("avg"));
    }

    @Test
    void byDepotSkipsSensorTypesWithNoData() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(), 0);
        var result = new DepotRepository().byDepot(fake, "table", new String[]{"gps_speed_kmh"}, 5);
        @SuppressWarnings("unchecked")
        var depots = (List<Map<String, Object>>) result.get("depots");
        assertTrue(depots.isEmpty());
    }
}
