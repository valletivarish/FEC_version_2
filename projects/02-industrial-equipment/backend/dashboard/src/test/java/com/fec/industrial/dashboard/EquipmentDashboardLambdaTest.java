package com.fec.industrial.dashboard;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class EquipmentDashboardLambdaTest {

    private final EquipmentDashboardLambda lambda = new EquipmentDashboardLambda();

    @AfterEach
    void resetClient() {
        DashboardApp.dynamo = null;
    }

    private static Map<String, AttributeValue> window(String windowEnd, double latest) {
        return Map.of(
            "sensor_type", AttributeValue.fromS("vibration"),
            "site_id", AttributeValue.fromS("line-1"),
            "window_end", AttributeValue.fromS(windowEnd),
            "unit", AttributeValue.fromS("mm/s"),
            "latest", AttributeValue.fromN(String.valueOf(latest)),
            "min", AttributeValue.fromN("1.0"),
            "max", AttributeValue.fromN("9.0"),
            "count", AttributeValue.fromN("4"),
            "alerts", AttributeValue.fromL(List.of()));
    }

    @Test
    void unknownRouteIs404() {
        var response = lambda.handleRequest(Map.of("httpMethod", "GET", "path", "/api/nope"), null);
        assertEquals(404, response.get("statusCode"));
    }

    @Test
    void nonGetIsRejected() {
        var response = lambda.handleRequest(Map.of("httpMethod", "POST", "path", "/api/readings"), null);
        assertEquals(405, response.get("statusCode"));
    }

    @Test
    void readingsRouteEchoesSensorTypeAndItems() {
        DashboardApp.dynamo = new FakeDynamoDbClient(
            Map.of("vibration", List.of(window("e2", 8.0), window("e1", 2.0))), 0);

        var response = lambda.handleRequest(Map.of(
            "httpMethod", "GET",
            "path", "/api/readings",
            "queryStringParameters", Map.of("sensor_type", "vibration", "limit", "20")), null);

        assertEquals(200, response.get("statusCode"));
        String body = (String) response.get("body");
        assertTrue(body.contains("\"sensor_type\":\"vibration\""));
        assertTrue(body.contains("\"window_end\":\"e1\""));
    }

    @Test
    void corsHeaderPresentOnEveryResponse() {
        var response = lambda.handleRequest(Map.of("httpMethod", "GET", "path", "/api/nope"), null);
        @SuppressWarnings("unchecked")
        Map<String, String> headers = (Map<String, String>) response.get("headers");
        assertEquals("*", headers.get("Access-Control-Allow-Origin"));
    }

    @Test
    void summaryRouteReturnsTheSensorsEnvelope() {
        DashboardApp.dynamo = new FakeDynamoDbClient(Map.of(), 0);
        var response = lambda.handleRequest(Map.of("httpMethod", "GET", "path", "/api/summary"), null);
        assertEquals(200, response.get("statusCode"));
        assertTrue(((String) response.get("body")).contains("\"sensors\""));
    }

    @Test
    void trailingSlashIsNormalizedToTheBareRoute() {
        DashboardApp.dynamo = new FakeDynamoDbClient(Map.of(), 0);
        var response = lambda.handleRequest(Map.of("httpMethod", "GET", "path", "/api/summary/"), null);
        assertEquals(200, response.get("statusCode"), "trailing slash must route the same as /api/summary");
    }

    @Test
    void readingsRouteDefaultsLimitWhenAbsent() {
        DashboardApp.dynamo = new FakeDynamoDbClient(Map.of("vibration", List.of(window("e1", 2.0))), 0);
        var response = lambda.handleRequest(Map.of(
            "httpMethod", "GET",
            "path", "/api/readings",
            "queryStringParameters", Map.of("sensor_type", "vibration")), null);
        assertEquals(200, response.get("statusCode"));
        assertTrue(((String) response.get("body")).contains("\"window_end\":\"e1\""));
    }

    @Test
    void missingHttpMethodDefaultsToGet() {
        // No httpMethod key: getOrDefault must treat it as GET, so an unknown path is 404 rather than 405.
        var response = lambda.handleRequest(Map.of("path", "/api/nope"), null);
        assertEquals(404, response.get("statusCode"));
    }
}
