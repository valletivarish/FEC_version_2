package com.fec.smartcity.fog;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public class CityFogNode {

    record ZoneKey(String metric, String zoneId) {}

    record ReadingDto(String ts, double value) {}

    private record DigestPayload(
        String sensor_type,
        String site_id,
        String unit,
        String window_start,
        String window_end,
        int count,
        double min,
        double max,
        double avg,
        double latest,
        List<String> alerts
    ) {}

    /**
     * One window's worth of accumulators, fenced so it can be retired without losing
     * a write that was already in flight when the fence closed. A writer that enters
     * before {@link #close()} flips the fence is guaranteed to finish before close()
     * returns the map; a writer that arrives after must retry against the next
     * generation instead of landing in a map no flush will ever read again.
     */
    private static final class Generation {
        private final ConcurrentHashMap<ZoneKey, WindowSummary.WindowAccumulator> readings = new ConcurrentHashMap<>();
        private final AtomicInteger inFlightWriters = new AtomicInteger();
        private final AtomicBoolean fenced = new AtomicBoolean(false);

        ConcurrentHashMap<ZoneKey, WindowSummary.WindowAccumulator> readings() {
            return readings;
        }

        boolean tryApply(ZoneKey key, List<Double> values) {
            inFlightWriters.incrementAndGet();
            try {
                if (fenced.get()) {
                    return false;
                }
                WindowSummary.WindowAccumulator acc =
                    readings.computeIfAbsent(key, k -> new WindowSummary.WindowAccumulator());
                for (double value : values) {
                    acc.add(value);
                }
                return true;
            } finally {
                inFlightWriters.decrementAndGet();
            }
        }

        Map<ZoneKey, WindowSummary.WindowAccumulator> close() {
            fenced.set(true);
            while (inFlightWriters.get() > 0) {
                Thread.onSpinWait();
            }
            return readings;
        }
    }

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "fsc-metrics-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    private final AtomicReference<Generation> generationRef = new AtomicReference<>(new Generation());
    private final ConcurrentHashMap<String, String> units = new ConcurrentHashMap<>();
    RelayClient relay;
    ScheduledExecutorService scheduler;

    ConcurrentHashMap<ZoneKey, WindowSummary.WindowAccumulator> bufferedReadings() {
        return generationRef.get().readings();
    }

    void ingest(String metric, String zoneId, String unit, List<Double> values) {
        ZoneKey key = new ZoneKey(metric, zoneId);
        Generation generation;
        do {
            generation = generationRef.get();
        } while (!generation.tryApply(key, values));
        if (unit != null && !unit.isEmpty()) units.put(metric, unit);
    }

    List<WindowSummary.Digest> flushWindow() {
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();
        Generation retiring = generationRef.getAndSet(new Generation());
        Map<ZoneKey, WindowSummary.WindowAccumulator> snapshot = retiring.close();
        Map<String, String> unitsSnapshot = Map.copyOf(units);

        List<WindowSummary.Digest> digests = new ArrayList<>();
        for (Map.Entry<ZoneKey, WindowSummary.WindowAccumulator> entry : snapshot.entrySet()) {
            if (entry.getValue().count() == 0) continue;
            ZoneKey key = entry.getKey();
            digests.add(entry.getValue().snapshot(
                key.metric(), key.zoneId(), unitsSnapshot.getOrDefault(key.metric(), ""), windowStart, windowEnd
            ));
        }
        return digests;
    }

    String digestToJson(WindowSummary.Digest digest, List<String> incidents) throws IOException {
        DigestPayload payload = new DigestPayload(
            digest.sensorType(),
            digest.siteId(),
            digest.unit(),
            digest.windowStart(),
            digest.windowEnd(),
            digest.count(),
            digest.min(),
            digest.max(),
            digest.avg(),
            digest.latest(),
            incidents
        );
        return JSON.writeValueAsString(payload);
    }

    void runWindowCycle() {
        try {
            for (WindowSummary.Digest digest : flushWindow()) {
                List<String> incidents = IncidentRules.assess(digest.sensorType(), digest);
                relay.emit(digestToJson(digest, incidents));
            }
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        } finally {
            if (scheduler != null) {
                long periodMs = (long) (WINDOW_SECONDS * 1000);
                scheduler.schedule(this::runWindowCycle, periodMs, TimeUnit.MILLISECONDS);
            }
        }
    }

    String thresholdsJson() {
        ObjectNode root = JSON.createObjectNode();
        IncidentRules.RULE_CATALOG.forEach((metric, rules) -> {
            ArrayNode arr = root.putArray(metric);
            for (IncidentRules.RuleDescription rule : rules) {
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

    private void handleHealth(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, "{\"status\":\"ok\"}");
    }

    private void handleThresholds(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, thresholdsJson());
    }

    private void handleIngest(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        JsonNode body = JSON.readTree(RouteServer.readBody(exchange));
        String metric = body.get("sensor_type").asText();
        String zoneId = body.has("site_id") ? body.get("site_id").asText() : "zone-1";
        String unit = body.has("unit") ? body.get("unit").asText() : "";
        List<ReadingDto> readings = JSON.convertValue(body.get("readings"), new TypeReference<List<ReadingDto>>() {});
        List<Double> values = readings.stream().map(ReadingDto::value).toList();
        ingest(metric, zoneId, unit, values);
        RouteServer.sendJson(exchange, 202, "{\"accepted\":" + values.size() + "}");
    }

    public static void main(String[] args) throws Exception {
        CityFogNode node = new CityFogNode();
        node.relay = new RelayClient(ENDPOINT, REGION, QUEUE_NAME);

        RouteServer.on(8000)
            .route("/health", node::handleHealth)
            .route("/thresholds", node::handleThresholds)
            .route("/ingest", node::handleIngest)
            .threads(4)
            .start();
        System.out.println("fog listening on :8000");

        node.scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        node.scheduler.schedule(node::runWindowCycle, periodMs, TimeUnit.MILLISECONDS);
    }
}
