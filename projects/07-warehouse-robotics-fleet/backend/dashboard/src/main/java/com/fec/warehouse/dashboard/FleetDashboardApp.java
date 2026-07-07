package com.fec.warehouse.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.sqs.SqsClient;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;

public class FleetDashboardApp {

    static final ObjectMapper JSON = new ObjectMapper();
    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "wrf-readings");
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "wrf-fleet-agg");
    static final String FUNCTION_NAME = System.getenv().getOrDefault("LAMBDA_FUNCTION_NAME", "wrf-processor");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
    static final String FOG_HEALTH_URL = System.getenv().getOrDefault("FOG_HEALTH_URL", "http://fog:8000/health");
    static final String FOG_THRESHOLDS_URL = System.getenv().getOrDefault("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds");
    static final String[] SENSOR_TYPES = {"battery_level_pct", "payload_kg", "motor_temp_c", "position_drift_cm", "task_queue_depth"};
    static final int PIPELINE_FRESH_SECONDS = 30;
    static final int ROSTER_TRAIL_LENGTH = 12;

    private final FleetRepository repository = new FleetRepository();
    private final PipelineChecks checks = new PipelineChecks();
    private final ThresholdsGateway thresholdsGateway = new ThresholdsGateway();
    private final HttpClient upstream = HttpClient.newHttpClient();

    private DynamoDbClient dynamo;
    private SqsClient sqs;
    private LambdaClient lambda;
    private String thresholdsCache;

    private synchronized DynamoDbClient dynamo() {
        if (dynamo == null) dynamo = awsClient(DynamoDbClient.builder());
        return dynamo;
    }

    private synchronized SqsClient sqs() {
        if (sqs == null) sqs = awsClient(SqsClient.builder());
        return sqs;
    }

    private synchronized LambdaClient lambda() {
        if (lambda == null) lambda = awsClient(LambdaClient.builder());
        return lambda;
    }

    private static <B extends software.amazon.awssdk.awscore.client.builder.AwsClientBuilder<B, T>, T> T awsClient(B builder) {
        builder.region(Region.of(REGION))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        if (ENDPOINT != null) builder.endpointOverride(URI.create(ENDPOINT));
        return builder.build();
    }

    static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> params = new HashMap<>();
        if (rawQuery == null) return params;
        for (String pair : rawQuery.split("&")) {
            String[] kv = pair.split("=", 2);
            String key = URLDecoder.decode(kv[0], StandardCharsets.UTF_8);
            String value = kv.length > 1 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "";
            params.put(key, value);
        }
        return params;
    }

    static String contentTypeFor(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        return "application/octet-stream";
    }

    private boolean fogHealthy() {
        try {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(FOG_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            return upstream.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private synchronized String thresholds() throws Exception {
        if (thresholdsCache == null) {
            thresholdsCache = thresholdsGateway.fetch(upstream, FOG_THRESHOLDS_URL);
        }
        return thresholdsCache;
    }

    private Double freshestWindowAgeSeconds() {
        Instant now = Instant.now();
        Double best = null;
        for (String sensorType : SENSOR_TYPES) {
            var recent = repository.recentWindows(dynamo(), TABLE_NAME, sensorType, 1);
            if (recent.isEmpty()) continue;
            String windowEnd = (String) recent.get(recent.size() - 1).get("window_end");
            double age = Duration.between(Instant.parse(windowEnd), now).toMillis() / 1000.0;
            if (best == null || age < best) best = age;
        }
        return best;
    }

    private void handleRoster(HttpExchange exchange) throws IOException {
        writeJson(exchange, 200, repository.buildRoster(dynamo(), TABLE_NAME, SENSOR_TYPES, ROSTER_TRAIL_LENGTH));
    }

    private void handleReadings(HttpExchange exchange) throws IOException {
        Map<String, String> q = parseQuery(exchange.getRequestURI().getQuery());
        String sensorType = q.get("sensor_type");
        int limit = q.containsKey("limit") ? Integer.parseInt(q.get("limit")) : 60;
        var items = repository.recentWindows(dynamo(), TABLE_NAME, sensorType, limit);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sensor_type", sensorType);
        body.put("items", items);
        writeJson(exchange, 200, body);
    }

    private void handleThresholds(HttpExchange exchange) throws IOException {
        try {
            writeJson(exchange, 200, thresholds());
        } catch (Exception e) {
            writeJson(exchange, 502, Map.of("error", "thresholds unavailable"));
        }
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        Double freshestAge = freshestWindowAgeSeconds();
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("gateway", fogHealthy());
        health.put("queue", checks.queueReachable(sqs(), QUEUE_NAME));
        health.put("lambda", checks.lambdaDeployed(lambda(), FUNCTION_NAME));
        health.put("pipeline", freshestAge != null && freshestAge <= PIPELINE_FRESH_SECONDS);
        health.put("freshest_age_seconds", freshestAge);
        writeJson(exchange, 200, health);
    }

    private void handleBackendStats(HttpExchange exchange) throws IOException {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("queue", checks.queueDepth(sqs(), QUEUE_NAME));
        stats.put("items_in_table", checks.itemCount(dynamo(), TABLE_NAME));
        writeJson(exchange, 200, stats);
    }

    private void handleStatic(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath().substring(1);
        Path file = Path.of(path);
        if (!Files.exists(file)) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        writeBytes(exchange, 200, Files.readAllBytes(file), contentTypeFor(path));
    }

    private void handleIndex(HttpExchange exchange) throws IOException {
        if (!exchange.getRequestURI().getPath().equals("/")) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        writeBytes(exchange, 200, Files.readAllBytes(Path.of("static/index.html")), "text/html");
    }

    private void writeJson(HttpExchange exchange, int status, Object body) throws IOException {
        String text = body instanceof String s ? s : JSON.writeValueAsString(body);
        writeBytes(exchange, status, text.getBytes(StandardCharsets.UTF_8), "application/json");
    }

    private static void writeBytes(HttpExchange exchange, int status, byte[] bytes, String contentType) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private Map<String, HttpHandler> routes() {
        Map<String, HttpHandler> routes = new LinkedHashMap<>();
        routes.put("/api/fleet", this::handleRoster);
        routes.put("/api/readings", this::handleReadings);
        routes.put("/api/thresholds", this::handleThresholds);
        routes.put("/api/health", this::handleHealth);
        routes.put("/api/backend-stats", this::handleBackendStats);
        routes.put("/static", this::handleStatic);
        routes.put("/", this::handleIndex);
        return routes;
    }

    private void start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);
        for (var entry : routes().entrySet()) {
            HttpHandler handler = entry.getValue();
            server.createContext(entry.getKey(), exchange -> {
                try {
                    handler.handle(exchange);
                } catch (Exception exc) {
                    System.out.println(exchange.getRequestURI() + " failed: " + exc);
                    writeJson(exchange, 500, Map.of("error", "internal error"));
                }
            });
        }
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("dashboard listening on :8000");
    }

    public static void main(String[] args) throws IOException {
        new FleetDashboardApp().start();
    }
}
