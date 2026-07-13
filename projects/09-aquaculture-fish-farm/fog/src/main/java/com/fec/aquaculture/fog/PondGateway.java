package com.fec.aquaculture.fog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Lock-free fog buffering via ConcurrentHashMap<PondKey, ReadingAccumulator>.merge() for atomic per-key combine, with flushWindow() swapping in a fresh map instead of locking so ingest() never contends with the drain. */
public class PondGateway {

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "aff-pond-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    private volatile ConcurrentHashMap<PondKey, ReadingAccumulator> buffers = new ConcurrentHashMap<>();
    QueuePublisher publisher;

    void ingest(String sensorType, String siteId, String unit, List<Double> values) {
        PondKey key = new PondKey(sensorType, siteId);
        ReadingAccumulator incoming = ReadingAccumulator.of(values, unit);
        buffers.merge(key, incoming, ReadingAccumulator::combine);
    }

    List<WindowAggregate> flushWindow() {
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();

        ConcurrentHashMap<PondKey, ReadingAccumulator> retiring = buffers;
        buffers = new ConcurrentHashMap<>();

        List<WindowAggregate> results = new ArrayList<>();
        for (var entry : retiring.entrySet()) {
            List<Double> values = entry.getValue().values();
            if (values.isEmpty()) continue;
            PondKey key = entry.getKey();
            results.add(WindowAggregate.of(key.sensorType(), key.siteId(), entry.getValue().unit(),
                values, windowStart, windowEnd));
        }
        return results;
    }

    void runWindowCycle() {
        try {
            for (WindowAggregate window : flushWindow()) {
                List<String> alerts = PondAlerts.evaluate(window.sensorType(), window);
                publisher.publish(StreamingJson.aggregatePayload(window, alerts));
            }
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        }
    }

    static String thresholdsJson() {
        Map<String, List<Rule>> bySensorType = new LinkedHashMap<>();
        for (Rule rule : PondAlerts.RULES) {
            bySensorType.computeIfAbsent(rule.sensorType(), k -> new ArrayList<>()).add(rule);
        }
        return StreamingJson.thresholdsPayload(bySensorType);
    }

    void handleHealth(HttpExchange exchange) throws IOException {
        PathDispatcher.respond(exchange, 200, StreamingJson.status("ok"));
    }

    void handleThresholds(HttpExchange exchange) throws IOException {
        PathDispatcher.respond(exchange, 200, thresholdsJson());
    }

    void handleIngest(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        JsonNode body;
        try {
            body = JSON.readTree(PathDispatcher.bodyOf(exchange));
        } catch (Exception e) {
            PathDispatcher.respond(exchange, 400, StreamingJson.error("malformed JSON body"));
            return;
        }
        IngestPayload payload;
        try {
            payload = IngestPayload.parse(body);
        } catch (IngestPayload.ValidationException e) {
            PathDispatcher.respond(exchange, 400, StreamingJson.error(e.getMessage()));
            return;
        }
        ingest(payload.sensorType(), payload.siteId(), payload.unit(), payload.values());
        PathDispatcher.respond(exchange, 202, StreamingJson.accepted(payload.values().size()));
    }

    public static void main(String[] args) throws Exception {
        PondGateway gateway = new PondGateway();
        gateway.publisher = new QueuePublisher(ENDPOINT, REGION, QUEUE_NAME);

        PathDispatcher dispatcher = new PathDispatcher()
            .exact("/health", gateway::handleHealth)
            .exact("/thresholds", gateway::handleThresholds)
            .exact("/ingest", gateway::handleIngest);

        HttpServer server = PathDispatcher.bind(8000, 4, dispatcher);
        server.start();
        System.out.println("fog listening on :8000");

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        scheduler.scheduleAtFixedRate(gateway::runWindowCycle, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }
}
