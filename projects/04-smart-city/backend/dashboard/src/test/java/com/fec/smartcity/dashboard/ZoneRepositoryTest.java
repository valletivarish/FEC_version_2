package com.fec.smartcity.dashboard;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.*;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class ZoneRepositoryTest {

    static Map<String, AttributeValue> reading(String metric, String zoneId, String windowEnd, double latest) {
        return reading(metric, zoneId, windowEnd, latest, latest - 10, latest + 10, 4, List.of());
    }

    static Map<String, AttributeValue> reading(String metric, String zoneId, String windowEnd,
                                                double latest, double min, double max, int count, List<String> alerts) {
        Map<String, AttributeValue> row = new HashMap<>();
        row.put("sensor_type", AttributeValue.fromS(metric));
        row.put("site_id", AttributeValue.fromS(zoneId));
        row.put("window_end", AttributeValue.fromS(windowEnd));
        row.put("unit", AttributeValue.fromS("veh/min"));
        row.put("latest", AttributeValue.fromN(String.valueOf(latest)));
        row.put("min", AttributeValue.fromN(String.valueOf(min)));
        row.put("max", AttributeValue.fromN(String.valueOf(max)));
        row.put("count", AttributeValue.fromN(String.valueOf(count)));
        List<AttributeValue> alertValues = new ArrayList<>();
        alerts.forEach(a -> alertValues.add(AttributeValue.fromS(a)));
        row.put("alerts", AttributeValue.fromL(alertValues));
        return row;
    }

    @Test
    void recentWindowsReversesToChronologicalOrder() {
        var rows = List.of(
            reading("vehicle_count", "zone-1", "e2", 220.0),
            reading("vehicle_count", "zone-1", "e1", 100.0)
        );
        var client = FakeDynamoDbClient.withQueryResults(Map.of("vehicle_count", rows));

        var result = ZoneRepository.recentWindows(client, "table", "vehicle_count", 20);
        assertThat(result.get(0)).containsEntry("window_end", "e1");
        assertThat(result.get(1)).containsEntry("window_end", "e2");
    }

    @Test
    void buildZonesGroupsByZoneThenMetric() {
        var rows = List.of(
            reading("vehicle_count", "zone-1", "e2", 220.0, 200.0, 240.0, 4, List.of("congestion_risk")),
            reading("vehicle_count", "zone-1", "e1", 100.0, 90.0, 110.0, 4, List.of())
        );
        var client = FakeDynamoDbClient.withQueryResults(Map.of("vehicle_count", rows));

        var summary = ZoneRepository.buildZones(client, "table", new String[]{"vehicle_count", "noise_level"});
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> zones = (List<Map<String, Object>>) (List<?>) summary.get("zones");
        assertThat(zones).hasSize(1);
        Map<String, Object> zone1 = zones.get(0);
        assertThat(zone1).containsEntry("zone_id", "zone-1");
        @SuppressWarnings("unchecked")
        Map<String, Object> metrics = (Map<String, Object>) zone1.get("metrics");
        @SuppressWarnings("unchecked")
        Map<String, Object> vehicleReading = (Map<String, Object>) metrics.get("vehicle_count");
        assertThat(vehicleReading).containsEntry("latest", 220.0);
        @SuppressWarnings("unchecked")
        List<String> alerts = (List<String>) vehicleReading.get("alerts");
        assertThat(alerts).containsExactly("congestion_risk");
        assertThat(metrics).doesNotContainKey("noise_level");
    }

    static Stream<Object[]> zoneOrderingCases() {
        return Stream.of(
            new Object[]{List.of(
                reading("vehicle_count", "zone-2", "e1", 220.0),
                reading("vehicle_count", "zone-1", "e1", 100.0)
            ), List.of("zone-1", "zone-2")},
            new Object[]{List.of(
                reading("vehicle_count", "zone-3", "e1", 50.0),
                reading("vehicle_count", "zone-1", "e1", 60.0),
                reading("vehicle_count", "zone-2", "e1", 70.0)
            ), List.of("zone-1", "zone-2", "zone-3")}
        );
    }

    @ParameterizedTest(name = "zones come back sorted for input order {0}")
    @MethodSource("zoneOrderingCases")
    void buildZonesOrdersZoneIdsAlphabetically(List<Map<String, AttributeValue>> rows, List<String> expectedOrder) {
        var client = FakeDynamoDbClient.withQueryResults(Map.of("vehicle_count", rows));

        var summary = ZoneRepository.buildZones(client, "table", new String[]{"vehicle_count"});
        List<?> zones = (List<?>) summary.get("zones");
        List<String> actualOrder = zones.stream().map(z -> (String) ((Map<?, ?>) z).get("zone_id")).toList();
        assertThat(actualOrder).containsExactlyElementsOf(expectedOrder);
    }
}
