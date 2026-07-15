package com.fec.warehouse.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class FleetDashboardLambdaTest {

    private static FleetDashboardLambda lambdaWith(FleetReadingsTable dynamo) {
        RelayQueueStub sqs = new RelayQueueStub(true, Map.of("ApproximateNumberOfMessages", "0",
            "ApproximateNumberOfMessagesNotVisible", "0"));
        ProcessorStatusStub lambdaClient = new ProcessorStatusStub(true, State.ACTIVE);
        return new FleetDashboardLambda(dynamo, sqs, lambdaClient);
    }

    private static Map<String, Object> event(String method, String path, Map<String, String> query) {
        Map<String, Object> event = new HashMap<>();
        event.put("httpMethod", method);
        event.put("path", path);
        event.put("queryStringParameters", query);
        return event;
    }

    @Test
    void fleetRouteReturns200WithCorsHeader() {
        var lambda = lambdaWith(new FleetReadingsTable(Map.of(), 0));
        var res = lambda.handleRequest(event("GET", "/api/fleet", null), null);
        assertEquals(200, res.get("statusCode"));
        @SuppressWarnings("unchecked")
        Map<String, Object> headers = (Map<String, Object>) res.get("headers");
        assertEquals("*", headers.get("Access-Control-Allow-Origin"));
    }

    @Test
    void readingsRouteEchoesSensorTypeAndAppliesDefaultLimit() {
        var lambda = lambdaWith(new FleetReadingsTable(Map.of(), 0));
        var res = lambda.handleRequest(event("GET", "/api/readings", Map.of("sensor_type", "motor_temp_c")), null);
        assertEquals(200, res.get("statusCode"));
        assertTrue(((String) res.get("body")).contains("\"sensor_type\":\"motor_temp_c\""));
    }

    @Test
    void healthRouteCombinesGatewayQueueLambdaAndPipeline() {
        var lambda = lambdaWith(new FleetReadingsTable(Map.of(), 0));
        var res = lambda.handleRequest(event("GET", "/api/health", null), null);
        assertEquals(200, res.get("statusCode"));
        String body = (String) res.get("body");
        assertTrue(body.contains("\"queue\":true"));
        assertTrue(body.contains("\"lambda\":true"));
        assertTrue(body.contains("\"gateway\":false"), "no real fog host reachable in a unit test, so gateway must degrade to false, not throw");
    }

    @Test
    void backendStatsRouteReportsQueueDepthAndItemCount() {
        var lambda = lambdaWith(new FleetReadingsTable(Map.of(), 57));
        var res = lambda.handleRequest(event("GET", "/api/backend-stats", null), null);
        assertEquals(200, res.get("statusCode"));
        assertTrue(((String) res.get("body")).contains("\"items_in_table\":57"));
    }

    @Test
    void unmatchedRouteReturns404() {
        var lambda = lambdaWith(new FleetReadingsTable(Map.of(), 0));
        var res = lambda.handleRequest(event("GET", "/api/nope", null), null);
        assertEquals(404, res.get("statusCode"));
    }

    @Test
    void wrongMethodOnAKnownPathReturns404() {
        var lambda = lambdaWith(new FleetReadingsTable(Map.of(), 0));
        var res = lambda.handleRequest(event("POST", "/api/fleet", null), null);
        assertEquals(404, res.get("statusCode"));
    }

    @Test
    void trailingSlashIsNormalizedBeforeMatching() {
        var lambda = lambdaWith(new FleetReadingsTable(Map.of(), 0));
        var res = lambda.handleRequest(event("GET", "/api/fleet/", null), null);
        assertEquals(200, res.get("statusCode"));
    }

    @Test
    void thresholdsRouteDegradesTo500InsteadOfThrowingWhenFogIsUnreachable() {
        var lambda = lambdaWith(new FleetReadingsTable(Map.of(), 0));
        var res = lambda.handleRequest(event("GET", "/api/thresholds", null), null);
        assertEquals(500, res.get("statusCode"));
        @SuppressWarnings("unchecked")
        Map<String, Object> headers = (Map<String, Object>) res.get("headers");
        assertEquals("*", headers.get("Access-Control-Allow-Origin"), "even an error response must carry CORS or the frontend never sees why it failed");
    }
}
