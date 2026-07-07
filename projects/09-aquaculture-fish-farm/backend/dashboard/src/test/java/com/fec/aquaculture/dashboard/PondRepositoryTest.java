package com.fec.aquaculture.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PondRepositoryTest {

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
            Map.of("ph_level", List.of(item("ph_level", "pond-1", "t2", 7.5, 7.5), item("ph_level", "pond-1", "t1", 7.0, 7.0))), 0);

        var items = new PondRepository().recentWindows(fake, "table", "ph_level", 10);
        assertEquals("t1", items.get(0).get("window_end"));
        assertEquals("t2", items.get(1).get("window_end"));
    }

    @Test
    void byPondGroupsMetricsUnderEachPondId() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "water_temp_c", List.of(item("water_temp_c", "pond-1", "t1", 24.0, 24.0), item("water_temp_c", "pond-2", "t1", 26.5, 26.5)),
            "ph_level", List.of(item("ph_level", "pond-1", "t1", 7.2, 7.2))
        ), 0);

        var result = new PondRepository().byPond(fake, "table", new String[]{"water_temp_c", "ph_level"}, 5);
        @SuppressWarnings("unchecked")
        var ponds = (List<Map<String, Object>>) result.get("ponds");

        assertEquals(2, ponds.size());
        var byId = ponds.stream().collect(java.util.stream.Collectors.toMap(s -> s.get("site_id"), s -> s));
        assertTrue(byId.containsKey("pond-1"));
        assertTrue(byId.containsKey("pond-2"));

        @SuppressWarnings("unchecked")
        var pond1Metrics = (Map<String, Object>) byId.get("pond-1").get("metrics");
        assertTrue(pond1Metrics.containsKey("water_temp_c"));
        assertTrue(pond1Metrics.containsKey("ph_level"));

        @SuppressWarnings("unchecked")
        var pond2Metrics = (Map<String, Object>) byId.get("pond-2").get("metrics");
        assertTrue(pond2Metrics.containsKey("water_temp_c"));
        assertFalse(pond2Metrics.containsKey("ph_level"));
    }

    @Test
    void byPondProducesDistinctValuesPerPond() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "dissolved_oxygen_mgl", List.of(item("dissolved_oxygen_mgl", "pond-1", "t1", 7.0, 7.0), item("dissolved_oxygen_mgl", "pond-2", "t1", 3.5, 3.5))
        ), 0);

        var result = new PondRepository().byPond(fake, "table", new String[]{"dissolved_oxygen_mgl"}, 5);
        @SuppressWarnings("unchecked")
        var ponds = (List<Map<String, Object>>) result.get("ponds");
        var byId = ponds.stream().collect(java.util.stream.Collectors.toMap(s -> s.get("site_id"), s -> s));

        @SuppressWarnings("unchecked")
        var pond1Metric = (Map<String, Object>) ((Map<String, Object>) byId.get("pond-1").get("metrics")).get("dissolved_oxygen_mgl");
        @SuppressWarnings("unchecked")
        var pond2Metric = (Map<String, Object>) ((Map<String, Object>) byId.get("pond-2").get("metrics")).get("dissolved_oxygen_mgl");

        assertEquals(7.0, pond1Metric.get("avg"));
        assertEquals(3.5, pond2Metric.get("avg"));
        assertNotEquals(pond1Metric.get("avg"), pond2Metric.get("avg"));
    }

    @Test
    void byPondSkipsSensorTypesWithNoData() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(), 0);
        var result = new PondRepository().byPond(fake, "table", new String[]{"feed_dispensed_g"}, 5);
        @SuppressWarnings("unchecked")
        var ponds = (List<Map<String, Object>>) result.get("ponds");
        assertTrue(ponds.isEmpty());
    }
}
