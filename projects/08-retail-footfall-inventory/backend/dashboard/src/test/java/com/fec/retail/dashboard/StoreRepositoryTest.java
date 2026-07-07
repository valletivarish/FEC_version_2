package com.fec.retail.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class StoreRepositoryTest {

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
            Map.of("queue_length", List.of(item("queue_length", "store-1", "t2", 5, 5), item("queue_length", "store-1", "t1", 3, 3))), 0);

        var items = new StoreRepository().recentWindows(fake, "table", "queue_length", 10);
        assertEquals("t1", items.get(0).get("window_end"));
        assertEquals("t2", items.get(1).get("window_end"));
    }

    @Test
    void byStoreGroupsMetricsUnderEachStoreId() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "footfall_count", List.of(item("footfall_count", "store-1", "t1", 300, 300), item("footfall_count", "store-2", "t1", 450, 450)),
            "queue_length", List.of(item("queue_length", "store-1", "t1", 4, 4))
        ), 0);

        var result = new StoreRepository().byStore(fake, "table", new String[]{"footfall_count", "queue_length"}, 5);
        @SuppressWarnings("unchecked")
        var stores = (List<Map<String, Object>>) result.get("stores");

        assertEquals(2, stores.size());
        var byId = stores.stream().collect(java.util.stream.Collectors.toMap(s -> s.get("site_id"), s -> s));
        assertTrue(byId.containsKey("store-1"));
        assertTrue(byId.containsKey("store-2"));

        @SuppressWarnings("unchecked")
        var store1Metrics = (Map<String, Object>) byId.get("store-1").get("metrics");
        assertTrue(store1Metrics.containsKey("footfall_count"));
        assertTrue(store1Metrics.containsKey("queue_length"));

        @SuppressWarnings("unchecked")
        var store2Metrics = (Map<String, Object>) byId.get("store-2").get("metrics");
        assertTrue(store2Metrics.containsKey("footfall_count"));
        assertFalse(store2Metrics.containsKey("queue_length"));
    }

    @Test
    void byStoreProducesDistinctValuesPerStore() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "footfall_count", List.of(item("footfall_count", "store-1", "t1", 300, 300), item("footfall_count", "store-2", "t1", 480, 480))
        ), 0);

        var result = new StoreRepository().byStore(fake, "table", new String[]{"footfall_count"}, 5);
        @SuppressWarnings("unchecked")
        var stores = (List<Map<String, Object>>) result.get("stores");
        var byId = stores.stream().collect(java.util.stream.Collectors.toMap(s -> s.get("site_id"), s -> s));

        @SuppressWarnings("unchecked")
        var store1Metric = (Map<String, Object>) ((Map<String, Object>) byId.get("store-1").get("metrics")).get("footfall_count");
        @SuppressWarnings("unchecked")
        var store2Metric = (Map<String, Object>) ((Map<String, Object>) byId.get("store-2").get("metrics")).get("footfall_count");

        assertEquals(300.0, store1Metric.get("avg"));
        assertEquals(480.0, store2Metric.get("avg"));
        assertNotEquals(store1Metric.get("avg"), store2Metric.get("avg"));
    }

    @Test
    void byStoreSkipsSensorTypesWithNoData() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(), 0);
        var result = new StoreRepository().byStore(fake, "table", new String[]{"energy_draw_kw"}, 5);
        @SuppressWarnings("unchecked")
        var stores = (List<Map<String, Object>>) result.get("stores");
        assertTrue(stores.isEmpty());
    }
}
