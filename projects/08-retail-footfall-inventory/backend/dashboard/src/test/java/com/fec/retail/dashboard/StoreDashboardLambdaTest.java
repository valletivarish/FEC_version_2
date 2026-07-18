package com.fec.retail.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class StoreDashboardLambdaTest {

    private static Map<String, AttributeValue> window(String windowEnd, double latest) {
        return Map.of(
            "sensor_type", AttributeValue.fromS("queue_length"),
            "site_id", AttributeValue.fromS("store-1"),
            "unit", AttributeValue.fromS("people"),
            "window_end", AttributeValue.fromS(windowEnd),
            "count", AttributeValue.fromN("3"),
            "min", AttributeValue.fromN("1.0"),
            "max", AttributeValue.fromN("9.0"),
            "avg", AttributeValue.fromN(String.valueOf(latest)),
            "latest", AttributeValue.fromN(String.valueOf(latest)),
            "alerts", AttributeValue.fromL(List.of()));
    }

    private static StoreDashboardLambda lambdaWithFakeDynamo(FakeDynamoDbClient fake) throws Exception {
        StoreDashboardApp app = new StoreDashboardApp();
        Field field = StoreDashboardApp.class.getDeclaredField("dynamo");
        field.setAccessible(true);
        field.set(app, fake);
        return new StoreDashboardLambda(app);
    }

    @Test
    void unknownRouteIs404() {
        var response = new StoreDashboardLambda().handleRequest(Map.of("httpMethod", "GET", "path", "/api/nope"), null);
        assertEquals(404, response.get("statusCode"));
    }

    @Test
    void nonGetIsRejected() {
        var response = new StoreDashboardLambda().handleRequest(Map.of("httpMethod", "POST", "path", "/api/readings"), null);
        assertEquals(405, response.get("statusCode"));
    }

    @Test
    void corsHeaderPresentOnEveryResponse() {
        var response = new StoreDashboardLambda().handleRequest(Map.of("httpMethod", "GET", "path", "/api/nope"), null);
        @SuppressWarnings("unchecked")
        Map<String, String> headers = (Map<String, String>) response.get("headers");
        assertEquals("*", headers.get("Access-Control-Allow-Origin"));
    }

    @Test
    void readingsRouteDrivesRealHandler() throws Exception {
        var lambda = lambdaWithFakeDynamo(new FakeDynamoDbClient(
            Map.of("queue_length", List.of(window("t2", 5.0), window("t1", 3.0))), 0));

        var response = lambda.handleRequest(Map.of(
            "httpMethod", "GET",
            "path", "/api/readings",
            "queryStringParameters", Map.of("sensor_type", "queue_length", "limit", "10")), null);

        assertEquals(200, response.get("statusCode"));
        String body = (String) response.get("body");
        assertTrue(body.contains("\"sensor_type\":\"queue_length\""));
        assertTrue(body.contains("\"window_end\":\"t1\""));
    }
}
