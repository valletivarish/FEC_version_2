package com.fec.transit.fog;

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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Fog gateway for the public transit fleet pipeline: ingests batched
 * readings per (sensor_type, site_id) pair via the IntakeQueue, windows and
 * aggregates them every WINDOW_SECONDS, evaluates the real threshold rules
 * (TransitAlerts), and publishes one message per non-empty group to SQS.
 *
 * HTTP dispatch is a single HttpServer.createContext("/", ...) registration
 * whose handler (route()) resolves the request with a literal if/else if
 * chain over exchange.getRequestURI().getPath() -- no route table, no
 * predicate list, and no per-path createContext calls beyond the root one.
 * This is the sixth distinct HTTP dispatch shape in this portfolio's Java
 * lineage: 02 wires each route directly with its own createContext call
 * inline in main(), with no shared error boundary; 04's RouteServer and 07's
 * Router are both fluent builders that still register one createContext per
 * route (accumulate-then-wire, or wire-immediately); 08's Route enum
 * iterates values() once at startup to register one createContext per
 * constant; 09's PathDispatcher matches an ordered
 * List&lt;(Predicate&lt;String&gt;, HttpHandler)&gt; at request time. Here
 * there is exactly one registered context, and the routing decision inside
 * it is nothing more than a sequence of if/else if string comparisons.
 */
public class TransitGateway {

    static final ObjectMapper JSON = new ObjectMapper();
    static final double WINDOW_SECONDS = Double.parseDouble(System.getenv().getOrDefault("WINDOW_SECONDS", "10"));
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "ptf-depot-agg");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");

    private final IntakeQueue intake = new IntakeQueue();
    TransitPublisher publisher;

    void ingest(String sensorType, String siteId, String unit, List<Double> values) {
        for (double value : values) {
            intake.ingest(new ReadingEvent(sensorType, siteId, unit, value));
        }
    }

    List<WindowAggregate> flushWindow() {
        String windowEnd = Instant.now().toString();
        String windowStart = Instant.now().minusSeconds((long) WINDOW_SECONDS).toString();
        Map<GroupKey, List<ReadingEvent>> grouped = intake.drainAndGroup();

        List<WindowAggregate> results = new ArrayList<>();
        for (Map.Entry<GroupKey, List<ReadingEvent>> entry : grouped.entrySet()) {
            List<ReadingEvent> events = entry.getValue();
            if (events.isEmpty()) continue;
            GroupKey key = entry.getKey();
            List<Double> values = new ArrayList<>(events.size());
            String unit = "";
            for (ReadingEvent event : events) {
                values.add(event.value());
                if (event.unit() != null && !event.unit().isEmpty()) unit = event.unit();
            }
            results.add(WindowAggregate.of(key.sensorType(), key.siteId(), unit, values, windowStart, windowEnd));
        }
        return results;
    }

    void runWindowCycle() {
        try {
            for (WindowAggregate window : flushWindow()) {
                List<String> alerts = TransitAlerts.evaluate(window.sensorType(), window);
                publisher.publish(toPayload(window, alerts));
            }
        } catch (Exception exc) {
            System.out.println("window flush failed: " + exc.getMessage());
        }
    }

    static String toPayload(WindowAggregate w, List<String> alerts) {
        ObjectNode node = JSON.createObjectNode();
        node.put("sensor_type", w.sensorType());
        node.put("site_id", w.siteId());
        node.put("unit", w.unit());
        node.put("window_start", w.windowStart());
        node.put("window_end", w.windowEnd());
        node.put("count", w.count());
        node.put("min", w.min());
        node.put("max", w.max());
        node.put("avg", w.avg());
        node.put("latest", w.latest());
        ArrayNode arr = node.putArray("alerts");
        alerts.forEach(arr::add);
        return node.toString();
    }

    static String thresholdsJson() {
        Map<String, List<Rule>> bySensorType = new LinkedHashMap<>();
        for (Rule rule : TransitAlerts.RULES) {
            bySensorType.computeIfAbsent(rule.sensorType(), k -> new ArrayList<>()).add(rule);
        }
        ObjectNode root = JSON.createObjectNode();
        bySensorType.forEach((sensorType, rules) -> {
            ArrayNode arr = root.putArray(sensorType);
            for (Rule rule : rules) {
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

    void handleHealth(HttpExchange exchange) throws IOException {
        respond(exchange, 200, "{\"status\":\"ok\"}");
    }

    void handleThresholds(HttpExchange exchange) throws IOException {
        respond(exchange, 200, thresholdsJson());
    }

    void handleIngest(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        JsonNode body;
        try {
            body = JSON.readTree(bodyOf(exchange));
        } catch (Exception e) {
            respond(exchange, 400, "{\"error\":\"malformed JSON body\"}");
            return;
        }
        IngestPayload payload;
        try {
            payload = IngestPayload.parse(body);
        } catch (IngestPayload.ValidationException e) {
            respond(exchange, 400, "{\"error\":\"" + e.getMessage() + "\"}");
            return;
        }
        ingest(payload.sensorType(), payload.siteId(), payload.unit(), payload.values());
        respond(exchange, 202, "{\"accepted\":" + payload.values().size() + "}");
    }

    /** The if/else if dispatch chain described in the class comment above. */
    void route(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/health")) {
                handleHealth(exchange);
            } else if (path.equals("/thresholds")) {
                handleThresholds(exchange);
            } else if (path.equals("/ingest")) {
                handleIngest(exchange);
            } else {
                exchange.sendResponseHeaders(404, -1);
            }
        } catch (Exception exc) {
            System.out.println(exchange.getRequestURI() + " failed: " + exc);
            respond(exchange, 500, "{\"error\":\"internal error\"}");
        }
    }

    static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    static String bodyOf(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    public static void main(String[] args) throws Exception {
        TransitGateway gateway = new TransitGateway();
        gateway.publisher = new TransitPublisher(ENDPOINT, REGION, QUEUE_NAME);

        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);
        server.createContext("/", gateway::route);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("fog listening on :8000");

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMs = (long) (WINDOW_SECONDS * 1000);
        // Initial delay is also periodMs (not 0) so the first flush only fires
        // once a full window has actually accumulated readings.
        scheduler.scheduleAtFixedRate(gateway::runWindowCycle, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }
}
