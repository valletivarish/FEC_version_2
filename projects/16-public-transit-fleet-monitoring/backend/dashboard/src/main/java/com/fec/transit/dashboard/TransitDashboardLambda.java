package com.fec.transit.dashboard;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpPrincipal;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

// API Gateway entry point. Each /api route is served by the exact instance method TransitDashboardApp
// binds to its HttpServer, driven here through an in-memory exchange so no route logic is duplicated.
public class TransitDashboardLambda implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    @FunctionalInterface
    private interface Route {
        void handle(HttpExchange exchange) throws Exception;
    }

    private static TransitDashboardApp warmApp;

    private final Map<String, Route> routes;

    public TransitDashboardLambda() {
        this(warm());
    }

    // Test seam: drives a caller-supplied app so a stubbed DynamoDbClient can stand in for real AWS.
    TransitDashboardLambda(TransitDashboardApp app) {
        this.routes = Map.of(
            "/api/depots", app::handleDepots,
            "/api/readings", app::handleReadings,
            "/api/thresholds", app::handleThresholds,
            "/api/health", app::handleHealth,
            "/api/backend-stats", app::handleBackendStats);
    }

    private static synchronized TransitDashboardApp warm() {
        if (warmApp == null) warmApp = new TransitDashboardApp();
        return warmApp;
    }

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        String method = (String) event.getOrDefault("httpMethod", "GET");
        String path = normalize((String) event.getOrDefault("path", "/"));
        @SuppressWarnings("unchecked")
        Map<String, String> query = (Map<String, String>) event.getOrDefault("queryStringParameters", Map.of());

        if (!"GET".equals(method)) return json(405, "{\"error\":\"method not allowed\"}", "application/json");

        Route route = routes.get(path);
        if (route == null) return json(404, "{\"error\":\"not found\"}", "application/json");

        CapturingExchange exchange = new CapturingExchange(method, URI.create(path + queryString(query)));
        try {
            route.handle(exchange);
        } catch (Exception e) {
            return json(500, "{\"error\":\"internal error\"}", "application/json");
        }
        String contentType = exchange.responseHeaders.getFirst("Content-Type");
        return json(exchange.status, exchange.body(), contentType == null ? "application/json" : contentType);
    }

    private static String queryString(Map<String, String> query) {
        if (query == null || query.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("?");
        for (Map.Entry<String, String> entry : query.entrySet()) {
            if (sb.length() > 1) sb.append('&');
            sb.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8)).append('=')
              .append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    private static String normalize(String path) {
        if (path.length() > 1 && path.endsWith("/")) return path.substring(0, path.length() - 1);
        return path;
    }

    private static Map<String, Object> json(int status, String body, String contentType) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("statusCode", status);
        result.put("headers", Map.of("Content-Type", contentType, "Access-Control-Allow-Origin", "*"));
        result.put("body", body);
        return result;
    }

    // Minimal in-memory HttpExchange: enough of the surface for the dashboard handlers to read the
    // request URI and write a captured status + body. Everything the handlers never touch is stubbed.
    private static final class CapturingExchange extends HttpExchange {
        private final String method;
        private final URI uri;
        private final Headers requestHeaders = new Headers();
        private final Headers responseHeaders = new Headers();
        private final ByteArrayOutputStream bodyStream = new ByteArrayOutputStream();
        private int status = 200;

        CapturingExchange(String method, URI uri) {
            this.method = method;
            this.uri = uri;
        }

        String body() {
            return bodyStream.toString(StandardCharsets.UTF_8);
        }

        @Override public Headers getRequestHeaders() { return requestHeaders; }
        @Override public Headers getResponseHeaders() { return responseHeaders; }
        @Override public URI getRequestURI() { return uri; }
        @Override public String getRequestMethod() { return method; }
        @Override public HttpContext getHttpContext() { return null; }
        @Override public void close() { }
        @Override public InputStream getRequestBody() { return new ByteArrayInputStream(new byte[0]); }
        @Override public OutputStream getResponseBody() { return bodyStream; }
        @Override public void sendResponseHeaders(int rCode, long responseLength) { this.status = rCode; }
        @Override public InetSocketAddress getRemoteAddress() { return null; }
        @Override public int getResponseCode() { return status; }
        @Override public InetSocketAddress getLocalAddress() { return null; }
        @Override public String getProtocol() { return "HTTP/1.1"; }
        @Override public Object getAttribute(String name) { return null; }
        @Override public void setAttribute(String name, Object value) { }
        @Override public void setStreams(InputStream i, OutputStream o) { }
        @Override public HttpPrincipal getPrincipal() { return null; }
    }
}
