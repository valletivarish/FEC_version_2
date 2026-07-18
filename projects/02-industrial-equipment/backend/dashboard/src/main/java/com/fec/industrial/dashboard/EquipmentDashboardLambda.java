package com.fec.industrial.dashboard;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

import java.util.LinkedHashMap;
import java.util.Map;

// API Gateway entry point. DashboardApp's HttpServer binding has no meaning inside a Lambda
// invocation, so each route is served here by calling the same static helpers the HttpServer contexts use.
public class EquipmentDashboardLambda implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final Map<String, String> HEADERS = Map.of(
        "Content-Type", "application/json",
        "Access-Control-Allow-Origin", "*");

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        String method = (String) event.getOrDefault("httpMethod", "GET");
        String path = normalize((String) event.getOrDefault("path", "/"));
        @SuppressWarnings("unchecked")
        Map<String, String> query = (Map<String, String>) event.getOrDefault("queryStringParameters", Map.of());
        if (query == null) query = Map.of();

        if (!"GET".equals(method)) return json(405, "{\"error\":\"method not allowed\"}");

        try {
            switch (path) {
                case "/api/readings": {
                    String sensorType = query.get("sensor_type");
                    int limit = query.containsKey("limit") ? Integer.parseInt(query.get("limit")) : 60;
                    var items = DynamoHelper.recentRollups(DashboardApp.dynamo(), DashboardApp.TABLE_NAME, sensorType, limit);
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("sensor_type", sensorType);
                    body.put("items", items);
                    return json(200, DashboardApp.JSON.writeValueAsString(body));
                }
                case "/api/summary":
                    return json(200, DashboardApp.JSON.writeValueAsString(
                        DynamoHelper.assetSummary(DashboardApp.dynamo(), DashboardApp.TABLE_NAME, DashboardApp.SENSOR_TYPES)));
                case "/api/thresholds":
                    try {
                        return json(200, DashboardApp.cachedThresholds());
                    } catch (Exception e) {
                        return json(502, "{\"error\":\"thresholds unavailable\"}");
                    }
                case "/api/health":
                    return json(200, DashboardApp.JSON.writeValueAsString(DashboardApp.pipelineHealth()));
                case "/api/backend-stats":
                    return json(200, DashboardApp.JSON.writeValueAsString(DashboardApp.collectBackendStats()));
                default:
                    return json(404, "{\"error\":\"not found\"}");
            }
        } catch (Exception e) {
            String message = e.getMessage() == null ? "internal error" : e.getMessage();
            return json(500, "{\"error\":\"" + message.replace("\"", "'") + "\"}");
        }
    }

    private static String normalize(String path) {
        if (path.length() > 1 && path.endsWith("/")) return path.substring(0, path.length() - 1);
        return path;
    }

    private static Map<String, Object> json(int status, String body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("statusCode", status);
        result.put("headers", HEADERS);
        result.put("body", body);
        return result;
    }
}
