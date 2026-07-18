package com.fec.smartcity.dashboard;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CityDashboardLambdaTest {

    private final CityDashboardLambda lambda = new CityDashboardLambda();

    @AfterEach
    void resetClient() {
        CityDashboardApp.dynamoRef.set(null);
    }

    private static Map<String, AttributeValue> reading(String zoneId, String windowEnd, double latest) {
        return Map.of(
            "sensor_type", AttributeValue.fromS("vehicle_count"),
            "site_id", AttributeValue.fromS(zoneId),
            "window_end", AttributeValue.fromS(windowEnd),
            "unit", AttributeValue.fromS("veh/min"),
            "latest", AttributeValue.fromN(String.valueOf(latest)),
            "min", AttributeValue.fromN("90.0"),
            "max", AttributeValue.fromN("240.0"),
            "count", AttributeValue.fromN("4"),
            "alerts", AttributeValue.fromL(List.of()));
    }

    @Test
    void unknownRouteIs404() {
        var response = lambda.handleRequest(Map.of("httpMethod", "GET", "path", "/api/nope"), null);
        assertThat(response.get("statusCode")).isEqualTo(404);
    }

    @Test
    void nonGetIsRejected() {
        var response = lambda.handleRequest(Map.of("httpMethod", "DELETE", "path", "/api/zones"), null);
        assertThat(response.get("statusCode")).isEqualTo(405);
    }

    @Test
    void readingsRouteEchoesMetricAndItems() {
        CityDashboardApp.dynamoRef.set(FakeDynamoDbClient.withQueryResults(
            Map.of("vehicle_count", List.of(reading("zone-1", "e2", 220.0), reading("zone-1", "e1", 100.0)))));

        var response = lambda.handleRequest(Map.of(
            "httpMethod", "GET",
            "path", "/api/readings",
            "queryStringParameters", Map.of("sensor_type", "vehicle_count", "limit", "20")), null);

        assertThat(response.get("statusCode")).isEqualTo(200);
        String body = (String) response.get("body");
        assertThat(body).contains("\"sensor_type\":\"vehicle_count\"").contains("\"window_end\":\"e1\"");
    }

    @Test
    void corsHeaderPresentOnEveryResponse() {
        var response = lambda.handleRequest(Map.of("httpMethod", "GET", "path", "/api/nope"), null);
        @SuppressWarnings("unchecked")
        Map<String, String> headers = (Map<String, String>) response.get("headers");
        assertThat(headers).containsEntry("Access-Control-Allow-Origin", "*");
    }
}
