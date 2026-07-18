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

    record MachineChannel(String sensorType, String siteId) {}

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "fei-sensor-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    final Object bufferLock = new Object();
    final Map<MachineChannel, List<Reading>> windowBuffer = new HashMap<>();
    final Map<String, String> unitByType = new HashMap<>();
    QueueRelay relay;

    // Readings arrive on the HTTP pool while the scheduler flushes on its timer, so the shared buffer is guarded by one lock.
    void bufferReadings(String sensorType, String siteId, String unit, List<Reading> readings) {
        synchronized (bufferLock) {
            windowBuffer.computeIfAbsent(new MachineChannel(sensorType, siteId), k -> new ArrayList<>()).addAll(readings);
            if (unit != null && !unit.isEmpty()) unitByType.put(sensorType, unit);
        }
    }

    List<Aggregation.Summary> closeWindow() {
        // Wall-clock bounds labelling "since the last flush", not per-reading timestamps.
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();
        Map<MachineChannel, List<Reading>> snapshot;
        Map<String, String> unitsSnapshot;
        synchronized (bufferLock) {
            // Swap in a fresh buffer and process the old one outside the lock so ingest is never blocked.
            snapshot = new HashMap<>(windowBuffer);
            windowBuffer.clear();
            unitsSnapshot = new HashMap<>(unitByType);
        }
        List<Aggregation.Summary> summaries = new ArrayList<>();
        for (Map.Entry<MachineChannel, List<Reading>> entry : snapshot.entrySet()) {
            if (entry.getValue().isEmpty()) continue;
            MachineChannel key = entry.getKey();
            Aggregation.Summary summary = Aggregation.condenseWindow(
                key.sensorType(), key.siteId(), unitsSnapshot.getOrDefault(key.sensorType(), ""),
                entry.getValue(), windowStart, windowEnd
            );
            summaries.add(summary);
        }
        return summaries;
    }

    String encodeSummary(Aggregation.Summary summary, List<String> firedAlerts) {
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

    void runFlushCycle() {
        try {
            List<String> payloads = new ArrayList<>();
            for (Aggregation.Summary summary : closeWindow()) {
                List<String> fired = Alerts.diagnoseFaults(summary.sensorType(), summary);
                payloads.add(encodeSummary(summary, fired));
            }
            relay.relayWindow(payloads);
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        }
    }

    String faultRulesJson() {
        ObjectNode root = JSON.createObjectNode();
        Alerts.FAULT_RULES.forEach((sensorType, rules) -> {
            ArrayNode arr = root.putArray(sensorType);
            for (Alerts.FaultRule rule : rules) {
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
            sendJson(exchange, 200, app.faultRulesJson());
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
            app.bufferReadings(sensorType, siteId, unit, readings);
            sendJson(exchange, 202, "{\"accepted\":" + readings.size() + "}");
        });

        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("fog listening on :8000");

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        // Initial delay is periodMs (not 0) so the first flush only fires once a full window has accumulated.
        scheduler.scheduleAtFixedRate(app::runFlushCycle, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }
}
