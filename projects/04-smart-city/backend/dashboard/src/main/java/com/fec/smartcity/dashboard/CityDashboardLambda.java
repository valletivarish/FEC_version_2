package com.fec.smartcity.dashboard;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

import java.util.LinkedHashMap;
import java.util.Map;

// API Gateway entry point. Inside a Lambda the HttpServer binding in CityDashboardApp.main has no
// meaning, so each route is served by the same static helpers the RouteServer contexts delegate to.
public class CityDashboardLambda implements RequestHandler<Map<String, Object>, Map<String, Object>> {

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
                case "/api/readings":
                    return json(200, CityDashboardApp.JSON.writeValueAsString(readingsBody(query)));
                case "/api/zones":
                    return json(200, CityDashboardApp.JSON.writeValueAsString(
                        ZoneRepository.buildZones(CityDashboardApp.dynamo(), CityDashboardApp.TABLE_NAME, CityDashboardApp.METRIC_TYPES)));
                case "/api/thresholds":
                    try {
                        return json(200, CityDashboardApp.fetchThresholds());
                    } catch (Exception e) {
                        return json(502, "{\"error\":\"thresholds unavailable\"}");
                    }
                case "/api/health":
                    return json(200, CityDashboardApp.JSON.writeValueAsString(CityDashboardApp.assembleHealth()));
                case "/api/backend-stats":
                    return json(200, CityDashboardApp.JSON.writeValueAsString(CityDashboardApp.assembleBackendStats()));
                default:
                    return json(404, "{\"error\":\"not found\"}");
            }
        } catch (Exception e) {
            String message = e.getMessage() == null ? "internal error" : e.getMessage();
            return json(500, "{\"error\":\"" + message.replace("\"", "'") + "\"}");
        }
    }

    // Mirrors CityDashboardApp.serveReadings: same metric/limit/zone parameters and the same zone-narrowing.
    private static Map<String, Object> readingsBody(Map<String, String> query) {
        String metric = query.get("sensor_type");
        int limit = query.containsKey("limit") ? Integer.parseInt(query.get("limit")) : 60;
        String zoneId = query.get("site_id");
        int fetchLimit = zoneId == null ? limit : Math.max(limit * 4, 40);
        var fetched = ZoneRepository.recentWindows(CityDashboardApp.dynamo(), CityDashboardApp.TABLE_NAME, metric, fetchLimit);
        var items = CityDashboardApp.narrowToZone(fetched, zoneId, limit);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sensor_type", metric);
        body.put("items", items);
        return body;
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
