package com.fec.transit.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TransitDashboardLambdaTest {

    private static Map<String, AttributeValue> window(String windowEnd, double latest) {
        return Map.of(
            "sensor_type", AttributeValue.fromS("engine_temp_c"),
            "site_id", AttributeValue.fromS("depot-a"),
            "unit", AttributeValue.fromS("C"),
            "window_end", AttributeValue.fromS(windowEnd),
            "count", AttributeValue.fromN("3"),
            "min", AttributeValue.fromN("80.0"),
            "max", AttributeValue.fromN("95.0"),
            "avg", AttributeValue.fromN(String.valueOf(latest)),
            "latest", AttributeValue.fromN(String.valueOf(latest)),
            "alerts", AttributeValue.fromL(List.of()));
    }

    private static TransitDashboardLambda lambdaWithFakeDynamo(FakeDynamoDbClient fake) throws Exception {
        TransitDashboardApp app = new TransitDashboardApp();
        Field field = TransitDashboardApp.class.getDeclaredField("dynamo");
        field.setAccessible(true);
        field.set(app, fake);
        return new TransitDashboardLambda(app);
    }

    @Test
    void unknownRouteIs404() {
        var response = new TransitDashboardLambda().handleRequest(Map.of("httpMethod", "GET", "path", "/api/nope"), null);
        assertEquals(404, response.get("statusCode"));
    }

    @Test
    void nonGetIsRejected() {
        var response = new TransitDashboardLambda().handleRequest(Map.of("httpMethod", "PUT", "path", "/api/depots"), null);
        assertEquals(405, response.get("statusCode"));
    }

    @Test
    void corsHeaderPresentOnEveryResponse() {
        var response = new TransitDashboardLambda().handleRequest(Map.of("httpMethod", "GET", "path", "/api/nope"), null);
        @SuppressWarnings("unchecked")
        Map<String, String> headers = (Map<String, String>) response.get("headers");
        assertEquals("*", headers.get("Access-Control-Allow-Origin"));
    }

    @Test
    void readingsRouteDrivesRealHandler() throws Exception {
        var lambda = lambdaWithFakeDynamo(new FakeDynamoDbClient(
            Map.of("engine_temp_c", List.of(window("t2", 90.0), window("t1", 88.0))), 0));

        var response = lambda.handleRequest(Map.of(
            "httpMethod", "GET",
            "path", "/api/readings",
            "queryStringParameters", Map.of("sensor_type", "engine_temp_c", "limit", "10")), null);

        assertEquals(200, response.get("statusCode"));
        String body = (String) response.get("body");
        assertTrue(body.contains("\"sensor_type\":\"engine_temp_c\""));
        assertTrue(body.contains("\"window_end\":\"t1\""));
    }
}
