package com.fec.port.dashboard;

import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TerminalDashboardLambdaTest {

    static APIGatewayProxyRequestEvent request(String method, String path) {
        return new APIGatewayProxyRequestEvent().withHttpMethod(method).withPath(path);
    }

    static TerminalDashboardLambda lambda(Map<String, List<Map<String, AttributeValue>>> items,
                                           boolean queueExists, boolean lambdaExists) {
        var dynamo = new FakeDynamoDbClient(items, 0);
        var sqs = new FakeSqsClient(queueExists,
            Map.of("ApproximateNumberOfMessages", "0", "ApproximateNumberOfMessagesNotVisible", "0"));
        var lambdaClient = new FakeLambdaClient(lambdaExists, State.ACTIVE);
        return new TerminalDashboardLambda(dynamo, sqs, lambdaClient);
    }

    @Test
    void berthsRouteResolvesAndCarriesCorsHeader() {
        var response = lambda(Map.of(), true, true).handleRequest(request("GET", "/api/berths"), null);
        assertEquals(200, response.getStatusCode());
        assertEquals("*", response.getHeaders().get("Access-Control-Allow-Origin"));
        assertTrue(response.getBody().contains("berths"));
    }

    @Test
    void readingsRouteResolvesWithSensorType() {
        var event = request("GET", "/api/readings");
        event.setQueryStringParameters(Map.of("sensor_type", "crane_load_kg"));
        var response = lambda(Map.of(), true, true).handleRequest(event, null);
        assertEquals(200, response.getStatusCode());
        assertTrue(response.getBody().contains("crane_load_kg"));
    }

    @Test
    void healthRouteResolvesAndReportsQueueLambdaState() {
        var response = lambda(Map.of(), true, true).handleRequest(request("GET", "/api/health"), null);
        assertEquals(200, response.getStatusCode());
        assertTrue(response.getBody().contains("\"queue\":true"));
        assertTrue(response.getBody().contains("\"lambda\":true"));
    }

    @Test
    void healthRouteReportsQueueDownWhenQueueMissing() {
        var response = lambda(Map.of(), false, true).handleRequest(request("GET", "/api/health"), null);
        assertEquals(200, response.getStatusCode());
        assertTrue(response.getBody().contains("\"queue\":false"));
    }

    @Test
    void backendStatsRouteResolves() {
        var response = lambda(Map.of(), true, true).handleRequest(request("GET", "/api/backend-stats"), null);
        assertEquals(200, response.getStatusCode());
        assertTrue(response.getBody().contains("items_in_table"));
    }

    @Test
    void unknownPathReturns404WithCorsHeader() {
        var response = lambda(Map.of(), true, true).handleRequest(request("GET", "/api/does-not-exist"), null);
        assertEquals(404, response.getStatusCode());
        assertEquals("*", response.getHeaders().get("Access-Control-Allow-Origin"));
    }

    @Test
    void knownPathWrongMethodReturns404NotFiveOhFive() {
        var response = lambda(Map.of(), true, true).handleRequest(request("POST", "/api/berths"), null);
        assertEquals(404, response.getStatusCode());
    }

    @Test
    void optionsPreflightReturns200WithCorsHeaderAndEmptyBody() {
        var response = lambda(Map.of(), true, true).handleRequest(request("OPTIONS", "/api/berths"), null);
        assertEquals(200, response.getStatusCode());
        assertEquals("*", response.getHeaders().get("Access-Control-Allow-Origin"));
        assertEquals("", response.getBody());
    }

    @Test
    void everyResponseCarriesCorsHeaderIncludingErrors() {
        var okResp = lambda(Map.of(), true, true).handleRequest(request("GET", "/api/health"), null);
        var notFoundResp = lambda(Map.of(), true, true).handleRequest(request("GET", "/api/nope"), null);
        assertEquals("*", okResp.getHeaders().get("Access-Control-Allow-Origin"));
        assertEquals("*", notFoundResp.getHeaders().get("Access-Control-Allow-Origin"));
    }
}
