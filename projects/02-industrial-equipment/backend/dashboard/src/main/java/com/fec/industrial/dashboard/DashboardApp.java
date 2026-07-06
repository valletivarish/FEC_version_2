package com.fec.industrial.dashboard;

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
import java.time.Instant;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.Executors;

public class DashboardApp {

    static final ObjectMapper JSON = new ObjectMapper();
    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "fei-readings");
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "fei-sensor-agg");
    static final String FUNCTION_NAME = System.getenv().getOrDefault("LAMBDA_FUNCTION_NAME", "fei-processor");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
    static final String FOG_HEALTH_URL = System.getenv().getOrDefault("FOG_HEALTH_URL", "http://fog:8000/health");
    static final String FOG_THRESHOLDS_URL = System.getenv().getOrDefault("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds");
    static final String[] SENSOR_TYPES = {"vibration", "motor_temperature", "bearing_acoustic", "rotation_speed", "power_draw"};
    static final int PIPELINE_FRESH_SECONDS = 30;

    static DynamoDbClient dynamo;
    static SqsClient sqs;
    static LambdaClient lambdaClient;
    static String thresholdsCache;
    static final HttpClient httpClient = HttpClient.newHttpClient();

    static synchronized DynamoDbClient dynamo() {
        if (dynamo == null) {
            var builder = DynamoDbClient.builder().region(Region.of(REGION))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            if (ENDPOINT != null) builder.endpointOverride(URI.create(ENDPOINT));
            dynamo = builder.build();
        }
        return dynamo;
    }

    static synchronized SqsClient sqs() {
        if (sqs == null) {
            var builder = SqsClient.builder().region(Region.of(REGION))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            if (ENDPOINT != null) builder.endpointOverride(URI.create(ENDPOINT));
            sqs = builder.build();
        }
        return sqs;
    }

    static synchronized LambdaClient lambdaClient() {
        if (lambdaClient == null) {
            var builder = LambdaClient.builder().region(Region.of(REGION))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            if (ENDPOINT != null) builder.endpointOverride(URI.create(ENDPOINT));
            lambdaClient = builder.build();
        }
        return lambdaClient;
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

    static void sendJson(HttpExchange exchange, int status, Object body) throws IOException {
        String text = body instanceof String ? (String) body : JSON.writeValueAsString(body);
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    static boolean checkFogHealth() {
        try {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(FOG_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            HttpResponse<Void> resp = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            return resp.statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    static Map<String, Object> buildHealth() {
        boolean fogOk = checkFogHealth();
        boolean queueOk = HealthChecks.queueReachable(sqs(), QUEUE_NAME);
        boolean lambdaOk = HealthChecks.lambdaActive(lambdaClient(), FUNCTION_NAME);

        Double freshestAge = null;
        Instant now = Instant.now();
        for (String sensorType : SENSOR_TYPES) {
            var recent = DynamoHelper.recentWindows(dynamo(), TABLE_NAME, sensorType, 1);
            if (recent.isEmpty()) continue;
            String windowEnd = (String) recent.get(recent.size() - 1).get("window_end");
            double age = Duration.between(Instant.parse(windowEnd), now).toMillis() / 1000.0;
            if (freshestAge == null || age < freshestAge) freshestAge = age;
        }
        boolean pipelineOk = freshestAge != null && freshestAge <= PIPELINE_FRESH_SECONDS;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fog", fogOk);
        result.put("queue", queueOk);
        result.put("lambda", lambdaOk);
        result.put("pipeline", pipelineOk);
        result.put("freshest_age_seconds", freshestAge);
        return result;
    }

    static Map<String, Object> buildBackendStats() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("queue", HealthChecks.queueDepth(sqs(), QUEUE_NAME));
        result.put("items_in_table", HealthChecks.scanCount(dynamo(), TABLE_NAME));
        return result;
    }

    static synchronized String fetchThresholds() throws Exception {
        if (thresholdsCache == null) {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(FOG_THRESHOLDS_URL))
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

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);

        server.createContext("/api/readings", exchange -> {
            Map<String, String> q = parseQuery(exchange.getRequestURI().getQuery());
            String sensorType = q.get("sensor_type");
            int limit = q.containsKey("limit") ? Integer.parseInt(q.get("limit")) : 60;
            var items = DynamoHelper.recentWindows(dynamo(), TABLE_NAME, sensorType, limit);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("sensor_type", sensorType);
            body.put("items", items);
            sendJson(exchange, 200, body);
        });

        server.createContext("/api/summary", exchange -> {
            sendJson(exchange, 200, DynamoHelper.buildSummary(dynamo(), TABLE_NAME, SENSOR_TYPES));
        });

        server.createContext("/api/thresholds", exchange -> {
            try {
                sendJson(exchange, 200, fetchThresholds());
            } catch (Exception e) {
                sendJson(exchange, 502, "{\"error\":\"thresholds unavailable\"}");
            }
        });

        server.createContext("/api/health", exchange -> {
            sendJson(exchange, 200, buildHealth());
        });

        server.createContext("/api/backend-stats", exchange -> {
            sendJson(exchange, 200, buildBackendStats());
        });

        server.createContext("/static", exchange -> {
            String path = exchange.getRequestURI().getPath().substring(1); // "static/..."
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
        });

        server.createContext("/", exchange -> {
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
        });

        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("dashboard listening on :8000");
    }
}
