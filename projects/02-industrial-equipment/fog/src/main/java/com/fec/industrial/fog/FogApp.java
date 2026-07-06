package com.fec.industrial.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class FogApp {

    record PendingKey(String sensorType, String siteId) {}

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "fei-sensor-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    final Object lock = new Object();
    final Map<PendingKey, List<Reading>> pending = new HashMap<>();
    final Map<String, String> units = new HashMap<>();
    QueueRelay relay;

    void ingest(String sensorType, String siteId, String unit, List<Reading> readings) {
        synchronized (lock) {
            pending.computeIfAbsent(new PendingKey(sensorType, siteId), k -> new ArrayList<>()).addAll(readings);
            if (unit != null && !unit.isEmpty()) units.put(sensorType, unit);
        }
    }

    List<Aggregation.Summary> flushWindow() {
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();
        Map<PendingKey, List<Reading>> snapshot;
        Map<String, String> unitsSnapshot;
        synchronized (lock) {
            snapshot = new HashMap<>(pending);
            pending.clear();
            unitsSnapshot = new HashMap<>(units);
        }
        List<Aggregation.Summary> summaries = new ArrayList<>();
        for (Map.Entry<PendingKey, List<Reading>> entry : snapshot.entrySet()) {
            if (entry.getValue().isEmpty()) continue;
            PendingKey key = entry.getKey();
            Aggregation.Summary summary = Aggregation.rollUp(
                key.sensorType(), key.siteId(), unitsSnapshot.getOrDefault(key.sensorType(), ""),
                entry.getValue(), windowStart, windowEnd
            );
            summaries.add(summary);
        }
        return summaries;
    }

    String summaryToJson(Aggregation.Summary summary, List<String> firedAlerts) {
        ObjectNode node = JSON.createObjectNode();
        node.put("sensor_type", summary.sensorType());
        node.put("site_id", summary.siteId());
        node.put("unit", summary.unit());
        node.put("window_start", summary.windowStart());
        node.put("window_end", summary.windowEnd());
        node.put("count", summary.count());
        node.put("min", summary.min());
        node.put("max", summary.max());
        node.put("avg", summary.avg());
        node.put("latest", summary.latest());
        ArrayNode alerts = node.putArray("alerts");
        firedAlerts.forEach(alerts::add);
        return node.toString();
    }

    void runWindowCycle() {
        try {
            for (Aggregation.Summary summary : flushWindow()) {
                List<String> fired = Alerts.evaluate(summary.sensorType(), summary);
                relay.emit(summaryToJson(summary, fired));
            }
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        }
    }

    String thresholdsJson() {
        ObjectNode root = JSON.createObjectNode();
        Alerts.THRESHOLDS.forEach((sensorType, rules) -> {
            ArrayNode arr = root.putArray(sensorType);
            for (Alerts.Rule rule : rules) {
                ObjectNode r = JSON.createObjectNode();
                r.put("field", rule.field());
                r.put("op", rule.op());
                r.put("limit", rule.limit());
                r.put("key", rule.key());
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

    public static void main(String[] args) throws Exception {
        FogApp app = new FogApp();
        app.relay = new QueueRelay(ENDPOINT, REGION, QUEUE_NAME);

        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);

        server.createContext("/health", exchange -> {
            sendJson(exchange, 200, "{\"status\":\"ok\"}");
        });

        server.createContext("/thresholds", exchange -> {
            sendJson(exchange, 200, app.thresholdsJson());
        });

        server.createContext("/ingest", exchange -> {
            if (!"POST".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            JsonNode body = JSON.readTree(readBody(exchange));
            String sensorType = body.get("sensor_type").asText();
            String siteId = body.has("site_id") ? body.get("site_id").asText() : "line-1";
            String unit = body.has("unit") ? body.get("unit").asText() : "";
            List<Reading> readings = new ArrayList<>();
            for (JsonNode r : body.get("readings")) {
                readings.add(new Reading(r.get("ts").asText(), r.get("value").asDouble()));
            }
            app.ingest(sensorType, siteId, unit, readings);
            sendJson(exchange, 202, "{\"accepted\":" + readings.size() + "}");
        });

        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("fog listening on :8000");

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        scheduler.scheduleAtFixedRate(app::runWindowCycle, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }
}
