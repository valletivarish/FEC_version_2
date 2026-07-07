package com.fec.warehouse.sensor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.StringJoiner;

public class RobotUnit {

    record Metric(String unit, RandomWalk walk, double start) {}

    static final Map<String, Metric> METRICS = new LinkedHashMap<>();
    static {
        METRICS.put("battery_level_pct", new Metric("%", new RandomWalk(0, 100, 4.0), 80));
        METRICS.put("payload_kg", new Metric("kg", new RandomWalk(0, 200, 15.0), 40));
        METRICS.put("motor_temp_c", new Metric("C", new RandomWalk(20, 95, 4.0), 45));
        METRICS.put("position_drift_cm", new Metric("cm", new RandomWalk(0, 15, 0.8), 1));
        METRICS.put("task_queue_depth", new Metric("tasks", new RandomWalk(0, 50, 4.0), 5));
    }

    record Sample(Instant ts, double value) {}

    static String payload(String metric, String zoneId, String unit, java.util.List<Sample> samples) {
        StringJoiner readings = new StringJoiner(",", "[", "]");
        for (Sample s : samples) {
            readings.add("{\"ts\":\"" + s.ts() + "\",\"value\":" + s.value() + "}");
        }
        return "{\"sensor_type\":\"" + metric + "\",\"site_id\":\"" + zoneId + "\",\"unit\":\"" + unit
            + "\",\"readings\":" + readings + "}";
    }

    static boolean dispatch(HttpClient client, String fogUrl, String body) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(fogUrl))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(5))
                .build();
            client.send(request, HttpResponse.BodyHandlers.discarding());
            return true;
        } catch (Exception exc) {
            System.out.println("dispatch failed, will retry: " + exc.getMessage());
            return false;
        }
    }

    public static void main(String[] args) throws Exception {
        String metric = System.getenv("SENSOR_TYPE");
        if (metric == null) throw new IllegalStateException("SENSOR_TYPE env var is required");
        Metric profile = METRICS.get(metric);
        if (profile == null) throw new IllegalStateException("unknown SENSOR_TYPE: " + metric);

        String zoneId = System.getenv().getOrDefault("SITE_ID", "zone-a");
        long sampleMillis = (long) (Double.parseDouble(System.getenv().getOrDefault("SAMPLE_INTERVAL", "2")) * 1000);
        long dispatchMillis = (long) (Double.parseDouble(System.getenv().getOrDefault("DISPATCH_INTERVAL", "10")) * 1000);
        String fogUrl = System.getenv().getOrDefault("FOG_URL", "http://fog:8000/ingest");

        System.out.printf("%s@%s sampling every %dms, dispatching every %dms%n", metric, zoneId, sampleMillis, dispatchMillis);

        HttpClient client = HttpClient.newHttpClient();
        double value = profile.start();
        java.util.List<Sample> buffer = new java.util.ArrayList<>();

        long nextSample = System.currentTimeMillis();
        long nextDispatch = nextSample + dispatchMillis;

        while (true) {
            long now = System.currentTimeMillis();
            if (now >= nextSample) {
                value = profile.walk().advance(value);
                buffer.add(new Sample(Instant.now(), value));
                nextSample = now + sampleMillis;
            }
            if (now >= nextDispatch) {
                if (!buffer.isEmpty()) {
                    String body = payload(metric, zoneId, profile.unit(), buffer);
                    if (dispatch(client, fogUrl, body)) {
                        System.out.printf("%s dispatched %d readings%n", metric, buffer.size());
                        buffer.clear();
                    }
                }
                nextDispatch = now + dispatchMillis;
            }
            long untilNextEvent = Math.min(nextSample, nextDispatch) - System.currentTimeMillis();
            Thread.sleep(Math.max(1, Math.min(50, untilNextEvent)));
        }
    }
}
