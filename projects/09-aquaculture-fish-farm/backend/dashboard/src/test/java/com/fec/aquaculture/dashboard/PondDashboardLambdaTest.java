package com.fec.aquaculture.dashboard;

import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PondDashboardLambdaTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static APIGatewayProxyRequestEvent event(String method, String path, Map<String, String> query) {
        return new APIGatewayProxyRequestEvent()
            .withHttpMethod(method)
            .withPath(path)
            .withQueryStringParameters(query);
    }

    private static Map<String, Object> body(APIGatewayProxyResponseEvent response) throws Exception {
        return JSON.readValue(response.getBody(), Map.class);
    }

    @Test
    void everyResponseCarriesTheCorsHeader() {
        PondDashboardLambda lambda = new PondDashboardLambda(
            new FakeDynamoDbClient(Map.of(), 0), new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "0",
                "ApproximateNumberOfMessagesNotVisible", "0")), new FakeLambdaClient(true, State.ACTIVE));

        var response = lambda.handleRequest(event("GET", "/api/backend-stats", null), null);
        assertEquals("*", response.getHeaders().get("Access-Control-Allow-Origin"));
    }

    @Test
    void optionsShortCircuitsWithoutTouchingAnyAwsClient() {
        PondDashboardLambda lambda = new PondDashboardLambda(null, null, null);
        var response = lambda.handleRequest(event("OPTIONS", "/api/ponds", null), null);
        assertEquals(200, response.getStatusCode());
        assertEquals("*", response.getHeaders().get("Access-Control-Allow-Origin"));
    }

    @Test
    void unknownRouteReturns404() throws Exception {
        PondDashboardLambda lambda = new PondDashboardLambda(null, null, null);
        var response = lambda.handleRequest(event("GET", "/api/nonexistent", null), null);
        assertEquals(404, response.getStatusCode());
        assertTrue(((String) body(response).get("error")).contains("no route"));
    }

    @Test
    void pondsRouteReturnsRealGroupedData() throws Exception {
        var rows = List.of(Map.of(
            "sensor_type", AttributeValue.fromS("ph_level"),
            "site_id", AttributeValue.fromS("pond-1"),
            "unit", AttributeValue.fromS("pH"),
            "window_end", AttributeValue.fromS("2026-01-01T00:00:10Z"),
            "count", AttributeValue.fromN("3"),
            "min", AttributeValue.fromN("7.0"),
            "max", AttributeValue.fromN("7.4"),
            "avg", AttributeValue.fromN("7.2"),
            "latest", AttributeValue.fromN("7.2"),
            "alerts", AttributeValue.fromL(List.of())
        ));
        var dynamo = new FakeDynamoDbClient(Map.of("ph_level", rows), 0);
        PondDashboardLambda lambda = new PondDashboardLambda(dynamo, new FakeSqsClient(true, Map.of()), new FakeLambdaClient(true, State.ACTIVE));

        var response = lambda.handleRequest(event("GET", "/api/ponds", null), null);
        assertEquals(200, response.getStatusCode());
        var ponds = (List<Map<String, Object>>) body(response).get("ponds");
        assertEquals(1, ponds.size());
        assertEquals("pond-1", ponds.get(0).get("site_id"));
    }

    @Test
    void readingsRouteEchoesSensorTypeAndAppliesLimit() throws Exception {
        var rows = List.of(
            Map.of("sensor_type", AttributeValue.fromS("water_temp_c"), "site_id", AttributeValue.fromS("pond-1"), "avg", AttributeValue.fromN("24.5")),
            Map.of("sensor_type", AttributeValue.fromS("water_temp_c"), "site_id", AttributeValue.fromS("pond-2"), "avg", AttributeValue.fromN("25.1"))
        );
        var dynamo = new FakeDynamoDbClient(Map.of("water_temp_c", rows), 0);
        PondDashboardLambda lambda = new PondDashboardLambda(dynamo, new FakeSqsClient(true, Map.of()), new FakeLambdaClient(true, State.ACTIVE));

        var response = lambda.handleRequest(event("GET", "/api/readings", Map.of("sensor_type", "water_temp_c", "limit", "10")), null);
        assertEquals(200, response.getStatusCode());
        var parsed = body(response);
        assertEquals("water_temp_c", parsed.get("sensor_type"));
        assertEquals(2, ((List<?>) parsed.get("items")).size());
    }

    @Test
    void backendStatsCombinesQueueDepthAndItemCount() throws Exception {
        var dynamo = new FakeDynamoDbClient(Map.of(), List.of(500, 214));
        var sqs = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "3", "ApproximateNumberOfMessagesNotVisible", "1"));
        PondDashboardLambda lambda = new PondDashboardLambda(dynamo, sqs, new FakeLambdaClient(true, State.ACTIVE));

        var response = lambda.handleRequest(event("GET", "/api/backend-stats", null), null);
        assertEquals(200, response.getStatusCode());
        var parsed = body(response);
        assertEquals(714, parsed.get("items_in_table"));
        var queue = (Map<String, Object>) parsed.get("queue");
        assertEquals(3, queue.get("waiting"));
        assertEquals(1, queue.get("in_flight"));
    }

    @Test
    void readingsRouteReturns502WithCorsHeaderWhenLimitIsNotAnInteger() {
        var dynamo = new FakeDynamoDbClient(Map.of(), 0);
        PondDashboardLambda lambda = new PondDashboardLambda(dynamo, new FakeSqsClient(true, Map.of()), new FakeLambdaClient(true, State.ACTIVE));

        var response = lambda.handleRequest(event("GET", "/api/readings", Map.of("sensor_type", "water_temp_c", "limit", "not-a-number")), null);
        assertEquals(502, response.getStatusCode());
        assertEquals("*", response.getHeaders().get("Access-Control-Allow-Origin"));
    }
}
