package com.fec.retail.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Fog gateway for the retail footfall/inventory pipeline. Ingest just hands
 * readings to the BufferActor's single worker thread; a background
 * scheduler flushes the whole buffer every WINDOW_SECONDS, computes real
 * aggregates, evaluates the AlertRule enum, and publishes one JSON message
 * per non-empty (sensor_type, site_id) group to SQS.
 */
public class StoreGateway {

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "rfi-store-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    static final BufferActor ACTOR = new BufferActor();
    static QueuePublisher publisher;

    static void handleIngest(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        JsonNode body = JSON.readTree(Route.bodyOf(exchange));
        String sensorType = body.get("sensor_type").asText();
        String siteId = body.has("site_id") ? body.get("site_id").asText() : "store-1";
        String unit = body.has("unit") ? body.get("unit").asText() : "";

        List<Double> values = new ArrayList<>();
        for (JsonNode r : body.get("readings")) {
            values.add(r.get("value").asDouble());
        }
        ACTOR.enqueue(sensorType, siteId, unit, values);
        Route.respond(exchange, 202, "{\"accepted\":" + values.size() + "}");
    }

    static void handleThresholds(HttpExchange exchange) throws IOException {
        Route.respond(exchange, 200, thresholdsJson());
    }

    static String thresholdsJson() throws IOException {
        Map<String, List<ThresholdDescription>> bySensorType = new java.util.LinkedHashMap<>();
        for (AlertRule rule : AlertRule.values()) {
            bySensorType.computeIfAbsent(rule.sensorType(), k -> new ArrayList<>())
                .add(new ThresholdDescription(rule.field(), rule.op(), rule.limit(), rule.key()));
        }
        return JSON.writeValueAsString(bySensorType);
    }

    static List<WindowAggregate> flushWindow() {
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();
        BufferSnapshot snapshot = ACTOR.drainAll();

        List<WindowAggregate> results = new ArrayList<>();
        for (Map.Entry<SensorKey, List<Double>> entry : snapshot.buffers().entrySet()) {
            if (entry.getValue().isEmpty()) continue;
            SensorKey key = entry.getKey();
            String unit = snapshot.units().getOrDefault(key.sensorType(), "");
            results.add(WindowAggregate.of(key.sensorType(), key.siteId(), unit, entry.getValue(), windowStart, windowEnd));
        }
        return results;
    }

    static void runWindowCycle() {
        try {
            for (WindowAggregate window : flushWindow()) {
                List<String> alerts = AlertRule.evaluate(window);
                String payload = JSON.writeValueAsString(new AggregatePayload(window, alerts));
                publisher.publish(payload);
            }
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        }
    }

    public static void main(String[] args) throws Exception {
        publisher = new QueuePublisher(ENDPOINT, REGION, QUEUE_NAME);
        ACTOR.start();

        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);
        Route.wireAll(server, 4);
        server.start();
        System.out.println("fog listening on :8000");

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        // Initial delay equals the period so the first flush only fires once
        // a full window has actually accumulated readings.
        scheduler.scheduleAtFixedRate(StoreGateway::runWindowCycle, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }
}
