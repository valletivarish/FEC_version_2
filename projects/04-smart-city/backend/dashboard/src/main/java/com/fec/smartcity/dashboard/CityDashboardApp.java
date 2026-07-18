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
    // ambient_light's own cadence already carries ~26s of inherent latency, so 45s avoids false "stale" flips without masking a real stall.
    static final int FRESH_WINDOW_LIMIT_SECONDS = 45;

    static final AtomicReference<DynamoDbClient> dynamoRef = new AtomicReference<>();
    static final AtomicReference<SqsClient> sqsRef = new AtomicReference<>();
    static final AtomicReference<LambdaClient> lambdaRef = new AtomicReference<>();
    static String thresholdsCache;
    static final HttpClient httpClient = HttpClient.newHttpClient();

    static <T> T memoizedClient(AtomicReference<T> holder, Supplier<T> factory) {
        return holder.updateAndGet(existing -> existing != null ? existing : factory.get());
    }

    static <B extends software.amazon.awssdk.awscore.client.builder.AwsClientBuilder<B, T>, T> T openAwsClient(B builder) {
        builder.region(Region.of(REGION));
        // ENDPOINT is only set for LocalStack; gate the static test credentials on it so a real Lambda uses its execution role.
        if (ENDPOINT != null) {
            builder.endpointOverride(URI.create(ENDPOINT))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        return builder.build();
    }

    static DynamoDbClient dynamo() {
        return memoizedClient(dynamoRef, () -> openAwsClient(DynamoDbClient.builder()));
    }

    static SqsClient sqs() {
        return memoizedClient(sqsRef, () -> openAwsClient(SqsClient.builder()));
    }

    static LambdaClient lambdaClient() {
        return memoizedClient(lambdaRef, () -> openAwsClient(LambdaClient.builder()));
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

    static boolean relayReachable() {
        try {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(RELAY_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            HttpResponse<Void> resp = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            return resp.statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    // Tracks the minimum window age across a batch of metrics, fed one candidate age at a time.
    static final class WindowRecency {
        private Double bestAgeSeconds;

        WindowRecency offer(String windowEndIso, Instant now) {
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

        WindowRecency recency = new WindowRecency();
        for (String windowEnd : newestWindowEnds) {
            recency.offer(windowEnd, now);
        }
        return recency.bestAgeSeconds();
    }

    static Map<String, Object> assembleHealth() {
        Double freshestAge = freshestWindowAge(Instant.now());
        boolean pipelineOk = freshestAge != null && freshestAge <= FRESH_WINDOW_LIMIT_SECONDS;

        return new ResponseFields()
            .with("relay", relayReachable())
            .with("queue", PipelineHealth.queueStatus(sqs(), QUEUE_NAME).up())
            .with("lambda", PipelineHealth.lambdaStatus(lambdaClient(), FUNCTION_NAME).up())
            .with("pipeline", pipelineOk)
            .with("freshest_age_seconds", freshestAge)
            .build();
    }

    static Map<String, Object> assembleBackendStats() {
        return new ResponseFields()
            .with("queue", PipelineHealth.queueDepth(sqs(), QUEUE_NAME).orElse(null))
            .with("items_in_table", PipelineHealth.itemCount(dynamo(), TABLE_NAME))
            .build();
    }

    // Accumulates named JSON fields, rejecting blank or duplicate keys so a mis-wired field fails fast.
    static final class ResponseFields {
        private final Map<String, Object> entries = new LinkedHashMap<>();

        ResponseFields with(String key, Object value) {
            if (key == null || key.isBlank()) {
                throw new IllegalArgumentException("field key must not be blank");
            }
            if (entries.containsKey(key)) {
                throw new IllegalStateException("field already set: " + key);
            }
            entries.put(key, value);
            return this;
        }

        Map<String, Object> build() {
            return entries;
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

    static List<Map<String, Object>> narrowToZone(List<Map<String, Object>> items, String zoneId, int limit) {
        if (zoneId == null) return items;
        var matched = items.stream().filter(i -> zoneId.equals(i.get("site_id"))).collect(Collectors.toList());
        return matched.size() > limit ? matched.subList(matched.size() - limit, matched.size()) : matched;
    }

    static void serveReadings(HttpExchange exchange) throws IOException {
        Map<String, String> query = parseQuery(exchange.getRequestURI().getQuery());
        String metric = query.get("sensor_type");
        int limit = query.containsKey("limit") ? Integer.parseInt(query.get("limit")) : 60;
        String zoneId = query.get("site_id");
        int fetchLimit = zoneId == null ? limit : Math.max(limit * 4, 40);
        var fetched = ZoneRepository.recentWindows(dynamo(), TABLE_NAME, metric, fetchLimit);
        var items = narrowToZone(fetched, zoneId, limit);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sensor_type", metric);
        body.put("items", items);
        RouteServer.sendJson(exchange, 200, body);
    }

    static void serveZones(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, ZoneRepository.buildZones(dynamo(), TABLE_NAME, METRIC_TYPES));
    }

    static void serveThresholds(HttpExchange exchange) throws IOException {
        try {
            RouteServer.sendJson(exchange, 200, fetchThresholds());
        } catch (Exception e) {
            RouteServer.sendJson(exchange, 502, "{\"error\":\"thresholds unavailable\"}");
        }
    }

    static void serveHealth(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, assembleHealth());
    }

    static void serveBackendStats(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, assembleBackendStats());
    }

    static void serveFile(HttpExchange exchange, Path file, String contentType) throws IOException {
        RouteServer.sendRaw(exchange, 200, Files.readAllBytes(file), contentType, "no-store");
    }

    static void serveStatic(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath().substring(1);
        Path file = Path.of(path);
        if (!Files.exists(file)) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        serveFile(exchange, file, contentTypeFor(path));
    }

    static void serveIndex(HttpExchange exchange) throws IOException {
        if (!exchange.getRequestURI().getPath().equals("/")) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        serveFile(exchange, Path.of("static/index.html"), "text/html");
    }

    public static void main(String[] args) throws IOException {
        RouteServer.on(8000)
            .route("/api/readings", CityDashboardApp::serveReadings)
            .route("/api/zones", CityDashboardApp::serveZones)
            .route("/api/thresholds", CityDashboardApp::serveThresholds)
            .route("/api/health", CityDashboardApp::serveHealth)
            .route("/api/backend-stats", CityDashboardApp::serveBackendStats)
            .route("/static", CityDashboardApp::serveStatic)
            .route("/", CityDashboardApp::serveIndex)
            .threads(8)
            .start();
        System.out.println("dashboard listening on :8000");
    }
}
