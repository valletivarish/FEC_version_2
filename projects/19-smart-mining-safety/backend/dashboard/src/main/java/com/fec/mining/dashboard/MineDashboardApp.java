package com.fec.mining.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
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

/** Dashboard backend for the smart mining safety pipeline. Serves the REST API plus the static shaft-status frontend. */
public class MineDashboardApp {

    static final ObjectMapper JSON = new ObjectMapper();
    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "msm-readings");
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "msm-shaft-agg");
    static final String FUNCTION_NAME = System.getenv().getOrDefault("LAMBDA_FUNCTION_NAME", "msm-processor");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
    static final String FOG_HEALTH_URL = System.getenv().getOrDefault("FOG_HEALTH_URL", "http://fog:8000/health");
    static final String FOG_THRESHOLDS_URL = System.getenv().getOrDefault("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds");
    static final String[] SENSOR_TYPES = {"methane_ppm", "co_ppm", "dust_concentration_mgm3", "ground_vibration_mms", "ambient_temp_c"};
    static final int PIPELINE_FRESH_SECONDS = 30;
    static final int SHAFT_HISTORY_PER_TYPE = 20;

    private final ShaftRepository repository = new ShaftRepository();
    private final PipelineChecks checks = new PipelineChecks();
    private final ThresholdsProxy thresholdsProxy = new ThresholdsProxy();
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

    // Gated on ENDPOINT, not on any Lambda-injected env var: Lambda always
    // supplies its own execution-role credentials at runtime, so forcing a
    // static test/test pair here unconditionally would break real deployments.
    private static <B extends software.amazon.awssdk.awscore.client.builder.AwsClientBuilder<B, T>, T> T awsClient(B builder) {
        builder.region(Region.of(REGION));
        if (ENDPOINT != null) {
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            builder.endpointOverride(URI.create(ENDPOINT));
        }
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

    static void sendJson(HttpExchange exchange, int status, Object body) throws IOException {
        String text = body instanceof String ? (String) body : JSON.writeValueAsString(body);
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private boolean gatewayHealthy() {
        try {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(FOG_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            return upstream.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private synchronized String thresholds() throws Exception {
        // Cached for the process lifetime: HazardRules.CATALOG is a static,
        // code-defined constant that never changes at runtime, so
        // refetching it on every /api/thresholds call would just be a
        // repeated round-trip to fog with no fresher data to show for it.
        if (thresholdsCache == null) {
            thresholdsCache = thresholdsProxy.fetch(upstream, FOG_THRESHOLDS_URL);
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

    void handleShafts(HttpExchange exchange) throws Exception {
        sendJson(exchange, 200, repository.byShaft(dynamo(), TABLE_NAME, SENSOR_TYPES, SHAFT_HISTORY_PER_TYPE));
    }

    void handleReadings(HttpExchange exchange) throws Exception {
        Map<String, String> q = parseQuery(exchange.getRequestURI().getQuery());
        String sensorType = q.get("sensor_type");
        int limit = q.containsKey("limit") ? Integer.parseInt(q.get("limit")) : 60;
        var items = repository.recentWindows(dynamo(), TABLE_NAME, sensorType, limit);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sensor_type", sensorType);
        body.put("items", items);
        sendJson(exchange, 200, body);
    }

    void handleThresholds(HttpExchange exchange) throws Exception {
        try {
            sendJson(exchange, 200, thresholds());
        } catch (Exception e) {
            sendJson(exchange, 502, "{\"error\":\"thresholds unavailable\"}");
        }
    }

    void handleHealth(HttpExchange exchange) throws Exception {
        Double freshestAge = freshestWindowAgeSeconds();
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("gateway", gatewayHealthy());
        health.put("queue", checks.queueReachable(sqs(), QUEUE_NAME));
        health.put("lambda", checks.lambdaDeployed(lambda(), FUNCTION_NAME));
        health.put("pipeline", freshestAge != null && freshestAge <= PIPELINE_FRESH_SECONDS);
        health.put("freshest_age_seconds", freshestAge);
        sendJson(exchange, 200, health);
    }

    void handleBackendStats(HttpExchange exchange) throws Exception {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("queue", checks.queueDepth(sqs(), QUEUE_NAME));
        stats.put("items_in_table", checks.itemCount(dynamo(), TABLE_NAME));
        sendJson(exchange, 200, stats);
    }

    void handleStatic(HttpExchange exchange) throws Exception {
        String path = exchange.getRequestURI().getPath().substring(1);
        Path file = Path.of(path);
        if (!Files.exists(file)) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        byte[] bytes = Files.readAllBytes(file);
        exchange.getResponseHeaders().set("Content-Type", contentTypeFor(path));
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    void handleIndex(HttpExchange exchange) throws Exception {
        if (!exchange.getRequestURI().getPath().equals("/")) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        byte[] bytes = Files.readAllBytes(Path.of("static/index.html"));
        exchange.getResponseHeaders().set("Content-Type", "text/html");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    public static void main(String[] args) throws IOException {
        MineDashboardApp app = new MineDashboardApp();
        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);

        server.createContext("/api/shafts", wrap(app::handleShafts));
        server.createContext("/api/readings", wrap(app::handleReadings));
        server.createContext("/api/thresholds", wrap(app::handleThresholds));
        server.createContext("/api/health", wrap(app::handleHealth));
        server.createContext("/api/backend-stats", wrap(app::handleBackendStats));
        server.createContext("/static", wrap(app::handleStatic));
        server.createContext("/", wrap(app::handleIndex));

        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("dashboard listening on :8000");
    }

    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws Exception;
    }

    private static com.sun.net.httpserver.HttpHandler wrap(ExchangeHandler handler) {
        return exchange -> {
            try {
                handler.handle(exchange);
            } catch (Exception e) {
                System.out.println(exchange.getRequestURI() + " failed: " + e);
                sendJson(exchange, 500, "{\"error\":\"internal error\"}");
            }
        };
    }
}
