package com.fec.mining.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ShaftRepositoryTest {

    static Map<String, AttributeValue> item(String sensorType, String siteId, String windowEnd, double avg,
                                              double max, double latest, List<String> alerts) {
        return Map.of(
            "sensor_type", AttributeValue.fromS(sensorType),
            "site_id", AttributeValue.fromS(siteId),
            "unit", AttributeValue.fromS("x"),
            "window_end", AttributeValue.fromS(windowEnd),
            "count", AttributeValue.fromN("3"),
            "min", AttributeValue.fromN("1.0"),
            "max", AttributeValue.fromN(String.valueOf(max)),
            "avg", AttributeValue.fromN(String.valueOf(avg)),
            "latest", AttributeValue.fromN(String.valueOf(latest)),
            "alerts", AttributeValue.fromL(alerts.stream().map(AttributeValue::fromS).toList())
        );
    }

    @Test
    void recentWindowsReturnsChronologicalOrder() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(
            Map.of("methane_ppm", List.of(
                item("methane_ppm", "shaft-a", "t2", 900.0, 950.0, 900.0, List.of()),
                item("methane_ppm", "shaft-a", "t1", 800.0, 850.0, 800.0, List.of()))), 0);

        var items = new ShaftRepository().recentWindows(fake, "table", "methane_ppm", 10);
        assertEquals("t1", items.get(0).get("window_end"));
        assertEquals("t2", items.get(1).get("window_end"));
    }

    @Test
    void byShaftGroupsMetricsUnderEachShaftId() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "methane_ppm", List.of(
                item("methane_ppm", "shaft-a", "t1", 300.0, 320.0, 300.0, List.of()),
                item("methane_ppm", "shaft-b", "t1", 320.0, 340.0, 320.0, List.of())),
            "ambient_temp_c", List.of(item("ambient_temp_c", "shaft-a", "t1", 27.0, 28.0, 27.0, List.of()))
        ), 0);

        var result = new ShaftRepository().byShaft(fake, "table", new String[]{"methane_ppm", "ambient_temp_c"}, 5);
        @SuppressWarnings("unchecked")
        var shafts = (List<Map<String, Object>>) result.get("shafts");

        assertEquals(2, shafts.size());
        var byId = shafts.stream().collect(java.util.stream.Collectors.toMap(s -> s.get("site_id"), s -> s));
        assertTrue(byId.containsKey("shaft-a"));
        assertTrue(byId.containsKey("shaft-b"));

        @SuppressWarnings("unchecked")
        var shaftAMetrics = (Map<String, Object>) byId.get("shaft-a").get("metrics");
        assertTrue(shaftAMetrics.containsKey("methane_ppm"));
        assertTrue(shaftAMetrics.containsKey("ambient_temp_c"));

        @SuppressWarnings("unchecked")
        var shaftBMetrics = (Map<String, Object>) byId.get("shaft-b").get("metrics");
        assertTrue(shaftBMetrics.containsKey("methane_ppm"));
        assertFalse(shaftBMetrics.containsKey("ambient_temp_c"));
    }

    @Test
    void byShaftIncludesTheComputedStatusField() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(
            "methane_ppm", List.of(item("methane_ppm", "shaft-a", "t1", 300.0, 320.0, 300.0, List.of()))
        ), 0);
        var result = new ShaftRepository().byShaft(fake, "table", new String[]{"methane_ppm"}, 5);
        @SuppressWarnings("unchecked")
        var shafts = (List<Map<String, Object>>) result.get("shafts");
        assertEquals("SAFE", shafts.get(0).get("status"));
    }

    @Test
    void classifyIsDangerWhenAnyAlertBearingReadingHasFiredAlerts() {
        Map<String, Object> metrics = Map.of(
            "methane_ppm", Map.of("avg", 300.0, "alerts", List.of("methane_buildup_risk")),
            "co_ppm", Map.of("avg", 10.0, "alerts", List.of())
        );
        assertEquals("DANGER", ShaftRepository.classify(metrics));
    }

    @Test
    void classifyIsCautionAtSeventyFivePercentOfLimitWithNoFiredAlert() {
        // methane limit is 1000; 760 avg is 76% of that -- above the 75% caution line, no alert fired.
        Map<String, Object> metrics = Map.of(
            "methane_ppm", Map.of("avg", 760.0, "alerts", List.of())
        );
        assertEquals("CAUTION", ShaftRepository.classify(metrics));
    }

    @Test
    void classifyIsSafeBelowTheCautionRatioAndWithNoFiredAlerts() {
        Map<String, Object> metrics = Map.of(
            "methane_ppm", Map.of("avg", 400.0, "alerts", List.of()),
            "co_ppm", Map.of("avg", 20.0, "alerts", List.of())
        );
        assertEquals("SAFE", ShaftRepository.classify(metrics));
    }

    @Test
    void classifyIgnoresAmbientTempEntirelySinceItHasNoAlertRule() {
        // Even an absurd temp value must never push the status past SAFE.
        Map<String, Object> metrics = Map.of(
            "ambient_temp_c", Map.of("avg", 200.0, "alerts", List.of())
        );
        assertEquals("SAFE", ShaftRepository.classify(metrics));
    }

    @Test
    void classifyHandlesMissingMetricsGracefully() {
        assertEquals("SAFE", ShaftRepository.classify(Map.of()));
    }
}
