package com.fec.retail.dashboard;

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

/** Dashboard backend: serves the REST API and the KPI-tile-first static frontend, routing every endpoint through the DashboardRoute enum. */
public class StoreDashboardApp {

    static final ObjectMapper JSON = new ObjectMapper();
    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "rfi-readings");
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "rfi-store-agg");
    static final String FUNCTION_NAME = System.getenv().getOrDefault("LAMBDA_FUNCTION_NAME", "rfi-processor");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
    static final String FOG_HEALTH_URL = System.getenv().getOrDefault("FOG_HEALTH_URL", "http://fog:8000/health");
    static final String FOG_THRESHOLDS_URL = System.getenv().getOrDefault("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds");
    static final String[] SENSOR_TYPES = {"footfall_count", "shelf_stock_pct", "fridge_temp_c", "queue_length", "energy_draw_kw"};
    static final int PIPELINE_FRESH_SECONDS = 30;
    static final int STORE_HISTORY_PER_TYPE = 20;

    private final StoreRepository repository = new StoreRepository();
    private final PipelineChecks checks = new PipelineChecks();
    private final ThresholdsGateway thresholdsGateway = new ThresholdsGateway();
    private final HttpClient fogClient = HttpClient.newHttpClient();

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
        builder.region(Region.of(REGION));
        // Static test/test creds only apply to LocalStack; a real Lambda keeps its own execution-role creds.
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

    private boolean fogHealthy() {
        try {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(FOG_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            return fogClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private synchronized String thresholds() throws Exception {
        if (thresholdsCache == null) {
            thresholdsCache = thresholdsGateway.fetch(fogClient, FOG_THRESHOLDS_URL);
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

    /** Primary KPI-tile data source: per-store latest window for every sensor type. */
    HttpHandler handleStores() {
        return exchange -> writeJson(exchange, 200, repository.byStore(dynamo(), TABLE_NAME, SENSOR_TYPES, STORE_HISTORY_PER_TYPE));
    }

    HttpHandler handleReadings() {
        return exchange -> {
            Map<String, String> q = parseQuery(exchange.getRequestURI().getQuery());
            String sensorType = q.get("sensor_type");
            int limit = q.containsKey("limit") ? Integer.parseInt(q.get("limit")) : 60;
            var items = repository.recentWindows(dynamo(), TABLE_NAME, sensorType, limit);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("sensor_type", sensorType);
            body.put("items", items);
            writeJson(exchange, 200, body);
        };
    }

    HttpHandler handleThresholds() {
        return exchange -> {
            try {
                writeJson(exchange, 200, thresholds());
            } catch (Exception e) {
                writeJson(exchange, 502, Map.of("error", "thresholds unavailable"));
            }
        };
    }

    HttpHandler handleHealth() {
        return exchange -> {
            Double freshestAge = freshestWindowAgeSeconds();
            Map<String, Object> health = new LinkedHashMap<>();
            health.put("gateway", fogHealthy());
            health.put("queue", checks.queueReachable(sqs(), QUEUE_NAME));
            health.put("lambda", checks.lambdaDeployed(lambda(), FUNCTION_NAME));
            health.put("pipeline", freshestAge != null && freshestAge <= PIPELINE_FRESH_SECONDS);
            health.put("freshest_age_seconds", freshestAge);
            writeJson(exchange, 200, health);
        };
    }

    HttpHandler handleBackendStats() {
        return exchange -> {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("queue", checks.queueDepth(sqs(), QUEUE_NAME));
            stats.put("items_in_table", checks.itemCount(dynamo(), TABLE_NAME));
            writeJson(exchange, 200, stats);
        };
    }

    HttpHandler handleStatic() {
        return exchange -> {
            String path = exchange.getRequestURI().getPath().substring(1);
            Path file = Path.of(path);
            if (!Files.exists(file)) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            writeBytes(exchange, 200, Files.readAllBytes(file), contentTypeFor(path));
        };
    }

    HttpHandler handleIndex() {
        return exchange -> {
            if (!exchange.getRequestURI().getPath().equals("/")) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            writeBytes(exchange, 200, Files.readAllBytes(Path.of("static/index.html")), "text/html");
        };
    }

    private void writeJson(HttpExchange exchange, int status, Object body) throws IOException {
        String text = body instanceof String s ? s : JSON.writeValueAsString(body);
        writeBytes(exchange, status, text.getBytes(StandardCharsets.UTF_8), "application/json");
    }

    static void writeJsonStatic(HttpExchange exchange, int status, Map<String, String> body) throws IOException {
        writeBytes(exchange, status, JSON.writeValueAsString(body).getBytes(StandardCharsets.UTF_8), "application/json");
    }

    private static void writeBytes(HttpExchange exchange, int status, byte[] bytes, String contentType) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    public static void main(String[] args) throws IOException {
        StoreDashboardApp app = new StoreDashboardApp();
        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);
        DashboardRoute.wireAll(server, app, 8);
        server.start();
        System.out.println("dashboard listening on :8000");
    }
}
