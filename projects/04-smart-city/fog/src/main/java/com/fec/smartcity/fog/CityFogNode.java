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

    record IngestSample(String ts, double value) {}

    private record AggregatePayload(
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

    // One window's accumulators, fenced so it can be sealed without losing a write already in flight when the fence closed.
    private static final class WindowLedger {
        private final ConcurrentHashMap<ZoneKey, WindowSummary.WindowAccumulator> slots = new ConcurrentHashMap<>();
        private final AtomicInteger activeWriters = new AtomicInteger();
        private final AtomicBoolean sealed = new AtomicBoolean(false);

        ConcurrentHashMap<ZoneKey, WindowSummary.WindowAccumulator> slots() {
            return slots;
        }

        boolean admit(ZoneKey key, List<Double> values) {
            activeWriters.incrementAndGet();
            try {
                if (sealed.get()) {
                    return false;
                }
                WindowSummary.WindowAccumulator acc =
                    slots.computeIfAbsent(key, k -> new WindowSummary.WindowAccumulator());
                for (double value : values) {
                    acc.add(value);
                }
                return true;
            } finally {
                activeWriters.decrementAndGet();
            }
        }

        Map<ZoneKey, WindowSummary.WindowAccumulator> seal() {
            sealed.set(true);
            while (activeWriters.get() > 0) {
                Thread.onSpinWait();
            }
            return slots;
        }
    }

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "fsc-metrics-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    private final AtomicReference<WindowLedger> ledgerRef = new AtomicReference<>(new WindowLedger());
    private final ConcurrentHashMap<String, String> unitByMetric = new ConcurrentHashMap<>();
    RelayClient dispatcher;
    ScheduledExecutorService windowTimer;

    ConcurrentHashMap<ZoneKey, WindowSummary.WindowAccumulator> bufferedReadings() {
        return ledgerRef.get().slots();
    }

    void ingest(String metric, String zoneId, String unit, List<Double> values) {
        ZoneKey key = new ZoneKey(metric, zoneId);
        WindowLedger ledger;
        do {
            ledger = ledgerRef.get();
        } while (!ledger.admit(key, values));
        if (unit != null && !unit.isEmpty()) unitByMetric.put(metric, unit);
    }

    List<WindowSummary.Digest> flushWindow() {
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();
        WindowLedger retired = ledgerRef.getAndSet(new WindowLedger());
        Map<ZoneKey, WindowSummary.WindowAccumulator> frozen = retired.seal();
        Map<String, String> unitsSnapshot = Map.copyOf(unitByMetric);

        List<WindowSummary.Digest> digests = new ArrayList<>();
        for (Map.Entry<ZoneKey, WindowSummary.WindowAccumulator> entry : frozen.entrySet()) {
            if (entry.getValue().count() == 0) continue;
            ZoneKey key = entry.getKey();
            digests.add(entry.getValue().snapshot(
                key.metric(), key.zoneId(), unitsSnapshot.getOrDefault(key.metric(), ""), windowStart, windowEnd
            ));
        }
        return digests;
    }

    String digestToJson(WindowSummary.Digest digest, List<String> incidents) throws IOException {
        AggregatePayload payload = new AggregatePayload(
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

    void sweepAndDispatch() {
        try {
            List<String> payloads = new ArrayList<>();
            for (WindowSummary.Digest digest : flushWindow()) {
                List<String> incidents = IncidentRules.assess(digest.sensorType(), digest);
                payloads.add(digestToJson(digest, incidents));
            }
            dispatcher.emitBatch(payloads);
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        } finally {
            if (windowTimer != null) {
                long periodMs = (long) (WINDOW_SECONDS * 1000);
                windowTimer.schedule(this::sweepAndDispatch, periodMs, TimeUnit.MILLISECONDS);
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

    private void serveHealth(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, "{\"status\":\"ok\"}");
    }

    private void serveThresholds(HttpExchange exchange) throws IOException {
        RouteServer.sendJson(exchange, 200, thresholdsJson());
    }

    private void serveIngest(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        JsonNode body = JSON.readTree(RouteServer.readBody(exchange));
        String metric = body.get("sensor_type").asText();
        String zoneId = body.has("site_id") ? body.get("site_id").asText() : "zone-1";
        String unit = body.has("unit") ? body.get("unit").asText() : "";
        List<IngestSample> readings = JSON.convertValue(body.get("readings"), new TypeReference<List<IngestSample>>() {});
        List<Double> values = readings.stream().map(IngestSample::value).toList();
        ingest(metric, zoneId, unit, values);
        RouteServer.sendJson(exchange, 202, "{\"accepted\":" + values.size() + "}");
    }

    public static void main(String[] args) throws Exception {
        CityFogNode node = new CityFogNode();
        node.dispatcher = new RelayClient(ENDPOINT, REGION, QUEUE_NAME);

        RouteServer.on(8000)
            .route("/health", node::serveHealth)
            .route("/thresholds", node::serveThresholds)
            .route("/ingest", node::serveIngest)
            .threads(4)
            .start();
        System.out.println("fog listening on :8000");

        node.windowTimer = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        node.windowTimer.schedule(node::sweepAndDispatch, periodMs, TimeUnit.MILLISECONDS);
    }
}
