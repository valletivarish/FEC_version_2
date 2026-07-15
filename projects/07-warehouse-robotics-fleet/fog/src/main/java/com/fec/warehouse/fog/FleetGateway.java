package com.fec.warehouse.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class FleetGateway {

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "wrf-fleet-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    private final ConcurrentHashMap<RobotKey, BufferBucket> buckets = new ConcurrentHashMap<>();
    RelayPublisher relay;

    void ingest(String sensorType, String siteId, String unit, List<Double> values) {
        RobotKey key = new RobotKey(sensorType, siteId);
        buckets.computeIfAbsent(key, k -> new BufferBucket()).add(unit, values);
    }

    BufferBucket bucketFor(String sensorType, String siteId) {
        return buckets.get(new RobotKey(sensorType, siteId));
    }

    List<WindowAggregate> flushWindow() {
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();

        List<WindowAggregate> results = new ArrayList<>();
        for (Map.Entry<RobotKey, BufferBucket> entry : buckets.entrySet()) {
            List<Double> values = entry.getValue().drain();
            if (values.isEmpty()) continue;
            RobotKey key = entry.getKey();
            results.add(WindowAggregate.of(key.sensorType(), key.siteId(), entry.getValue().unit(),
                values, windowStart, windowEnd));
        }
        return results;
    }

    static String toPayload(WindowAggregate window, List<String> alerts) {
        return JsonBuilder.start()
            .field("sensor_type", window.sensorType())
            .field("site_id", window.siteId())
            .field("unit", window.unit())
            .field("window_start", window.windowStart())
            .field("window_end", window.windowEnd())
            .field("count", window.count())
            .field("min", window.min())
            .field("max", window.max())
            .field("avg", window.avg())
            .field("latest", window.latest())
            .stringArray("alerts", alerts)
            .toString();
    }

    void runWindowCycle() {
        try {
            List<String> payloads = new ArrayList<>();
            for (WindowAggregate window : flushWindow()) {
                List<String> alerts = FleetAlerts.evaluate(window.sensorType(), window);
                payloads.add(toPayload(window, alerts));
            }
            relay.publishBatch(payloads);
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        }
    }

    static String thresholdsJson() {
        var root = JsonBuilder.object();
        FleetAlerts.RULES.forEach((sensorType, rules) -> {
            var arr = root.putArray(sensorType);
            for (AlertRule rule : rules) {
                arr.add(JsonBuilder.object()
                    .put("field", rule.field())
                    .put("op", rule.op())
                    .put("limit", rule.limit())
                    .put("key", rule.key()));
            }
        });
        return root.toString();
    }

    void handleHealth(com.sun.net.httpserver.HttpExchange exchange) throws java.io.IOException {
        Router.respond(exchange, 200, "{\"status\":\"ok\"}");
    }

    void handleThresholds(com.sun.net.httpserver.HttpExchange exchange) throws java.io.IOException {
        Router.respond(exchange, 200, thresholdsJson());
    }

    void handleIngest(com.sun.net.httpserver.HttpExchange exchange) throws java.io.IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        JsonNode body = JSON.readTree(Router.bodyOf(exchange));
        String sensorType = body.get("sensor_type").asText();
        String siteId = body.has("site_id") ? body.get("site_id").asText() : "zone-a";
        String unit = body.has("unit") ? body.get("unit").asText() : "";

        List<Double> values = new ArrayList<>();
        for (JsonNode r : body.get("readings")) {
            values.add(r.get("value").asDouble());
        }
        ingest(sensorType, siteId, unit, values);
        Router.respond(exchange, 202, "{\"accepted\":" + values.size() + "}");
    }

    public static void main(String[] args) throws Exception {
        FleetGateway gateway = new FleetGateway();
        gateway.relay = new RelayPublisher(ENDPOINT, REGION, QUEUE_NAME);

        Router.bind(8000, 4)
            .handle("/health", gateway::handleHealth)
            .handle("/thresholds", gateway::handleThresholds)
            .handle("/ingest", gateway::handleIngest)
            .listen();
        System.out.println("fog listening on :8000");

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        scheduler.scheduleAtFixedRate(gateway::runWindowCycle, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }
}
