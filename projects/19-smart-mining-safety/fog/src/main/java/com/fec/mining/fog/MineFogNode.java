package com.fec.mining.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Fog gateway for the underground mine safety pipeline: ingests batched
 * readings per (sensor_type, site_id) pair via HazardBuffer, windows/
 * aggregates them every WINDOW_SECONDS, evaluates the real HazardRules
 * thresholds, and publishes one message per non-empty group to SQS via
 * SafetyPublisher. See HazardBuffer, ThresholdRule, SafetyPublisher and
 * GatewayRouter javadoc for exactly how each of those differs from the six
 * other Java fog siblings in this portfolio.
 */
public class MineFogNode {

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "msm-shaft-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    final HazardBuffer buffer = new HazardBuffer();
    SafetyPublisher publisher;

    void ingest(String sensorType, String siteId, String unit, List<Reading> readings) {
        buffer.ingest(sensorType, siteId, unit, readings);
    }

    List<WindowAggregate> flushWindow() {
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();
        List<WindowAggregate> results = new ArrayList<>();
        for (ShaftKey key : buffer.activeKeys()) {
            List<Reading> readings = buffer.drain(key);
            if (readings.isEmpty()) continue;
            results.add(WindowAggregate.of(key.sensorType(), key.siteId(), buffer.unitFor(key.sensorType()),
                readings, windowStart, windowEnd));
        }
        return results;
    }

    void runWindowCycle() {
        try {
            List<String> payloads = new ArrayList<>();
            for (WindowAggregate window : flushWindow()) {
                List<String> alerts = HazardRules.assess(window.sensorType(), window);
                payloads.add(PayloadJson.toJson(window, alerts));
            }
            publisher.emitBatch(payloads).join();
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        }
    }

    String thresholdsJson() {
        Map<String, List<ThresholdRule>> bySensorType = new LinkedHashMap<>();
        for (ThresholdRule rule : HazardRules.CATALOG) {
            bySensorType.computeIfAbsent(rule.sensorType(), k -> new ArrayList<>()).add(rule);
        }
        ObjectNode root = JSON.createObjectNode();
        bySensorType.forEach((sensorType, rules) -> {
            ArrayNode arr = root.putArray(sensorType);
            for (ThresholdRule rule : rules) {
                ObjectNode r = JSON.createObjectNode();
                r.put("field", rule.field().name().toLowerCase());
                r.put("op", ">");
                r.put("limit", rule.limit());
                r.put("key", rule.alertKey());
                arr.add(r);
            }
        });
        return root.toString();
    }

    static void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    void handleHealth(HttpExchange exchange) throws IOException {
        sendJson(exchange, 200, "{\"status\":\"ok\"}");
    }

    void handleThresholds(HttpExchange exchange) throws IOException {
        sendJson(exchange, 200, thresholdsJson());
    }

    void handleIngest(HttpExchange exchange) throws IOException {
        JsonNode body;
        try {
            body = JSON.readTree(readBody(exchange));
        } catch (Exception e) {
            sendJson(exchange, 400, "{\"error\":\"malformed JSON body\"}");
            return;
        }
        IngestPayload payload;
        try {
            payload = IngestPayload.parse(body);
        } catch (IngestPayload.ValidationException e) {
            sendJson(exchange, 400, "{\"error\":\"" + e.getMessage() + "\"}");
            return;
        }
        ingest(payload.sensorType(), payload.siteId(), payload.unit(), payload.readings());
        sendJson(exchange, 202, "{\"accepted\":" + payload.readings().size() + "}");
    }

    public static void main(String[] args) throws Exception {
        MineFogNode node = new MineFogNode();
        node.publisher = new SafetyPublisher(ENDPOINT, REGION, QUEUE_NAME);

        GatewayRouter router = new GatewayRouter()
            .route("GET", "/health", node::handleHealth)
            .route("GET", "/thresholds", node::handleThresholds)
            .route("POST", "/ingest", node::handleIngest);

        HttpServer server = router.bind(8000, 4);
        server.start();
        System.out.println("fog listening on :8000");

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        // Initial delay equals periodMs (not 0) so the first flush only
        // fires once a full window has actually accumulated.
        scheduler.scheduleAtFixedRate(node::runWindowCycle, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }
}
