package com.fec.aquaculture.sensor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * One process per (sensor_type, site_id) pair. Simulates a slowly-drifting
 * water-quality or feed-dispensing reading and independently batches/
 * dispatches it to the fog node's /ingest endpoint. SAMPLE_INTERVAL and
 * DISPATCH_INTERVAL are deliberately separate knobs -- a dissolved-oxygen
 * probe might sample every couple of seconds but the unit only phones home
 * less often, so the buffer genuinely accumulates several readings per POST.
 */
public class PondSensorUnit {

    record Metric(String unit, RandomWalk walk, double start) {}

    static final Map<String, Metric> METRICS = new LinkedHashMap<>();
    static {
        METRICS.put("water_temp_c", new Metric("C", new RandomWalk(10, 34, 0.8), 24));
        METRICS.put("dissolved_oxygen_mgl", new Metric("mg/L", new RandomWalk(1, 12, 0.6), 7));
        METRICS.put("ph_level", new Metric("pH", new RandomWalk(5.5, 9, 0.15), 7.2));
        METRICS.put("ammonia_ppm", new Metric("ppm", new RandomWalk(0, 2, 0.05), 0.15));
        METRICS.put("feed_dispensed_g", new Metric("g", new RandomWalk(0, 500, 40.0), 120));
    }

    record Sample(Instant ts, double value) {}

    static String payload(String sensorType, String siteId, String unit, List<Sample> samples) {
        StringJoiner readings = new StringJoiner(",", "[", "]");
        for (Sample s : samples) {
            readings.add("{\"ts\":\"" + s.ts() + "\",\"value\":" + s.value() + "}");
        }
        return "{\"sensor_type\":\"" + sensorType + "\",\"site_id\":\"" + siteId + "\",\"unit\":\"" + unit
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
        String sensorType = System.getenv("SENSOR_TYPE");
        if (sensorType == null) throw new IllegalStateException("SENSOR_TYPE env var is required");
        Metric profile = METRICS.get(sensorType);
        if (profile == null) throw new IllegalStateException("unknown SENSOR_TYPE: " + sensorType);

        String siteId = System.getenv().getOrDefault("SITE_ID", "pond-1");
        long sampleMillis = (long) (Double.parseDouble(System.getenv().getOrDefault("SAMPLE_INTERVAL", "2")) * 1000);
        long dispatchMillis = (long) (Double.parseDouble(System.getenv().getOrDefault("DISPATCH_INTERVAL", "10")) * 1000);
        String fogUrl = System.getenv().getOrDefault("FOG_URL", "http://fog:8000/ingest");

        System.out.printf("%s@%s sampling every %dms, dispatching every %dms%n", sensorType, siteId, sampleMillis, dispatchMillis);

        HttpClient client = HttpClient.newHttpClient();
        double value = profile.start();
        List<Sample> buffer = new ArrayList<>();

        // Two independent "next fire" timestamps rather than two threads:
        // a single loop polls both deadlines and sleeps for whichever is
        // closer, so sampling and dispatching never contend for the buffer
        // and no synchronization is needed within this process at all.
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
                    String body = payload(sensorType, siteId, profile.unit(), buffer);
                    if (dispatch(client, fogUrl, body)) {
                        System.out.printf("%s dispatched %d readings%n", sensorType, buffer.size());
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
