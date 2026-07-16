package com.fec.smartcity.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.sqs.SqsClient;

import java.io.IOException;
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
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import java.util.stream.Collectors;

public class CityDashboardApp {

    static final ObjectMapper JSON = new ObjectMapper();
    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "fsc-readings");
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "fsc-metrics-agg");
    static final String FUNCTION_NAME = System.getenv().getOrDefault("LAMBDA_FUNCTION_NAME", "fsc-processor");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
    static final String RELAY_HEALTH_URL = System.getenv().getOrDefault("FOG_HEALTH_URL", "http://fog:8000/health");
    static final String RELAY_THRESHOLDS_URL = System.getenv().getOrDefault("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds");
    static final String[] METRIC_TYPES = {"vehicle_count", "air_quality_pm25", "noise_level", "parking_occupancy", "ambient_light"};
    // ambient_light's own configured cadence (dispatch up to 16s + a 10s fog window)
    // already accounts for up to ~26s of inherent latency before Lambda even runs,
    // so 30s left almost no margin and caused frequent false "stale" flips under
    // normal operation -- 45s gives real headroom without masking a genuine stall.
    static final int PIPELINE_FRESH_SECONDS = 45;

    static final AtomicReference<DynamoDbClient> dynamoRef = new AtomicReference<>();
    static final AtomicReference<SqsClient> sqsRef = new AtomicReference<>();
    static final AtomicReference<LambdaClient> lambdaRef = new AtomicReference<>();
    static String thresholdsCache;
    static final HttpClient httpClient = HttpClient.newHttpClient();

    static <T> T lazyClient(AtomicReference<T> holder, Supplier<T> factory) {
        return holder.updateAndGet(existing -> existing != null ? existing : factory.get());
    }

    static <B extends software.amazon.awssdk.awscore.client.builder.AwsClientBuilder<B, T>, T> T buildAwsClient(B builder) {
        builder.region(Region.of(REGION));
        // ENDPOINT is only set for LocalStack. Outside it (real Lambda), the
        // static test/test credentials must not be applied -- they would
        // shadow the execution role's real credentials and every AWS call
        // would fail authentication.
        if (ENDPOINT != null) {
            builder.endpointOverride(URI.create(ENDPOINT))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        return builder.build();
    }

    static DynamoDbClient dynamo() {
        return lazyClient(dynamoRef, () -> buildAwsClient(DynamoDbClient.builder()));
    }

    static SqsClient sqs() {
        return lazyClient(sqsRef, () -> buildAwsClient(SqsClient.builder()));
    }

    static LambdaClient lambdaClient() {
        return lazyClient(lambdaRef, () -> buildAwsClient(LambdaClient.builder()));
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

    static boolean checkRelayHealth() {
        try {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(RELAY_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            HttpResponse<Void> resp = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            return resp.statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Tracks the minimum window age seen across a batch of metrics. Built once
     * per health check and fed one candidate age at a time, rather than being
     * derived from a single chained stream expression.
     */
    static final class FreshnessTracker {
        private Double bestAgeSeconds;

        FreshnessTracker offer(String windowEndIso, Instant now) {
            if (windowEndIso == null) return this;
            double ageSeconds = Duration.between(Instant.parse(windowEndIso), now).toMillis() / 1000.0;
            if (bestAgeSeconds == null || ageSeconds < bestAgeSeconds) {
                bestAgeSeconds = ageSeconds;
            }
            return this;
        }

        Double bestAgeSeconds() {
            return bestAgeSeconds;
        }
    }

    static String newestWindowEnd(String metric) {
        var recent = ZoneRepository.recentWindows(dynamo(), TABLE_NAME, metric, 1);
        return recent.isEmpty() ? null : (String) recent.get(recent.size() - 1).get("window_end");
    }

    static Double freshestWindowAge(Instant now) {
        List<String> newestWindowEnds = new ArrayList<>();
        for (String metric : METRIC_TYPES) {
            newestWindowEnds.add(newestWindowEnd(metric));
        }

        FreshnessTracker tracker = new FreshnessTracker();
        for (String windowEnd : newestWindowEnds) {
            tracker.offer(windowEnd, now);
        }
        return tracker.bestAgeSeconds();
    }

    static Map<String, Object> buildHealth() {
        Double freshestAge = freshestWindowAge(Instant.now());
        boolean pipelineOk = freshestAge != null && freshestAge <= PIPELINE_FRESH_SECONDS;

        return new ReportBuilder()
            .with("relay", checkRelayHealth())
            .with("queue", PipelineHealth.queueStatus(sqs(), QUEUE_NAME).up())
            .with("lambda", PipelineHealth.lambdaStatus(lambdaClient(), FUNCTION_NAME).up())
            .with("pipeline", pipelineOk)
            .with("freshest_age_seconds", freshestAge)
            .build();
    }

    static Map<String, Object> buildBackendStats() {
        return new ReportBuilder()
            .with("queue", PipelineHealth.queueDepth(sqs(), QUEUE_NAME).orElse(null))
            .with("items_in_table", PipelineHealth.itemCount(dynamo(), TABLE_NAME))
            .build();
    }

    /**
     * Accumulates named fields for a JSON response body. Beyond plain chaining,
     * it enforces that keys are non-blank and only ever set once, so a copy-paste
     * mistake wiring up a new field fails fast instead of silently overwriting
     * an earlier one.
     */
    static final class ReportBuilder {
        private final Map<String, Object> fields = new LinkedHashMap<>();

        ReportBuilder with(String key, Object value) {
            if (key == null || key.isBlank()) {
                throw new IllegalArgumentException("field key must not be blank");
            }
            if (fields.containsKey(key)) {
                throw new IllegalStateException("field already set: " + key);
            }
            fields.put(key, value);
            return this;
        }

        Map<String, Object> build() {
            return fields;
        }
    }

    static synchronized String fetchThresholds() throws Exception {
        if (thresholdsCache == null) {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(RELAY_THRESHOLDS_URL))
                .timeout(Duration.ofSeconds(5)).GET().build();
            HttpResponse<String> resp = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            thresholdsCache = resp.body();
        }
        return thresholdsCache;
    }

    static String contentTypeFor(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        return "application/octet-stream";
    }

    static List<Map<String, Object>> filterAndTrim(List<Map<String, Object>> items, String zoneId, int limit) {
        if (zoneId == null) return items;
        var matched = items.stream().filter(i -> zoneId.equals(i.get("site_id"))).collect(Collectors.toList());
        return matched.size() > limit ? matched.subList(matched.size() - limit, matched.size()) : matched;
    }

    static void handleReadings(HttpExchange exchange) throws IOException {
        Map<String, String> q = parseQuery(exchange.getRequestURI().getQuery());
        String metric = q.get("sensor_type");
        int limit = q.containsKey("limit") ? Integer.parseInt(q.get("limit")) : 60;
        String zoneId = q.get("site_id");
        int fetchLimit = zoneId == null ? limit : Math.max(limit * 4, 40);
        var fetched = ZoneRepository.recentWindows(dynamo(), TABLE_NAME, metric, fetchLimit);
        var items = filterAndTrim(fetched, zoneId, limit);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sensor_type", metric);
        body.put("items", items);
        RouteServer.sendJson(exchange, 200, body);
    }

    static void handleZones(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, ZoneRepository.buildZones(dynamo(), TABLE_NAME, METRIC_TYPES));
    }

    static void handleThresholds(HttpExchange exchange) throws IOException {
        try {
            RouteServer.sendJson(exchange, 200, fetchThresholds());
        } catch (Exception e) {
            RouteServer.sendJson(exchange, 502, "{\"error\":\"thresholds unavailable\"}");
        }
    }

    static void handleHealth(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, buildHealth());
    }

    static void handleBackendStats(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, buildBackendStats());
    }

    static void serveFile(HttpExchange exchange, Path file, String contentType) throws IOException {
        RouteServer.sendRaw(exchange, 200, Files.readAllBytes(file), contentType, "no-store");
    }

    static void handleStatic(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath().substring(1);
        Path file = Path.of(path);
        if (!Files.exists(file)) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        serveFile(exchange, file, contentTypeFor(path));
    }

    static void handleIndex(HttpExchange exchange) throws IOException {
        if (!exchange.getRequestURI().getPath().equals("/")) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        serveFile(exchange, Path.of("static/index.html"), "text/html");
    }

    public static void main(String[] args) throws IOException {
        RouteServer.on(8000)
            .route("/api/readings", CityDashboardApp::handleReadings)
            .route("/api/zones", CityDashboardApp::handleZones)
            .route("/api/thresholds", CityDashboardApp::handleThresholds)
            .route("/api/health", CityDashboardApp::handleHealth)
            .route("/api/backend-stats", CityDashboardApp::handleBackendStats)
            .route("/static", CityDashboardApp::handleStatic)
            .route("/", CityDashboardApp::handleIndex)
            .threads(8)
            .start();
        System.out.println("dashboard listening on :8000");
    }
}
