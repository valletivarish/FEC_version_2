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

/**
 * Fog gateway for the fish-farm pipeline: ingests batched readings per
 * (sensor_type, site_id) pair, windows/aggregates them, evaluates the real
 * threshold rules, and publishes one message per non-empty group to SQS.
 *
 * Buffering is a single ConcurrentHashMap<PondKey, ReadingAccumulator>
 * mutated only through its own merge(). Each ingest is one atomic
 * buffers.merge(key, incoming, ReadingAccumulator::combine) call -- there is
 * no explicit lock anywhere in this class, no AtomicReference/AtomicInteger/
 * AtomicBoolean fencing, and no dedicated worker thread draining a mailbox.
 * Correctness rests entirely on ConcurrentHashMap's documented guarantee
 * that the remapping function passed to merge() is applied atomically per
 * key, combined with ReadingAccumulator being an immutable value type (so
 * there is nothing else to race on). The flush cycle swaps the whole map
 * reference itself out via a fresh ConcurrentHashMap and iterates the
 * retired one undisturbed, so ingest() during a flush simply lands in the
 * new map instead of contending with the reader.
 */
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
