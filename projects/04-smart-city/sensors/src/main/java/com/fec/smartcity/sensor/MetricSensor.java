package com.fec.smartcity.sensor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.StringJoiner;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.random.RandomGenerator;

public class MetricSensor {

    record Profile(String unit, double lo, double hi, double start, double step) {

        double confine(double value) {
            return Math.max(lo, Math.min(hi, value));
        }

        double nextFrom(double current, RandomGenerator rng) {
            double drift = rng.nextDouble(-step, step);
            double bounded = confine(current + drift);
            return Math.round(bounded * 100.0) / 100.0;
        }
    }

    record StampedSample(double value, Instant ts) {}

    static final Map<String, Profile> METRIC_PROFILES = Map.of(
        "vehicle_count",     new Profile("veh/min", 0, 300, 60, 15.0),
        "air_quality_pm25",  new Profile("ug/m3", 2, 120, 18, 4.0),
        "noise_level",       new Profile("dB", 35, 95, 55, 3.0),
        "parking_occupancy", new Profile("%", 0, 100, 40, 6.0),
        "ambient_light",     new Profile("lux", 0, 50000, 8000, 1500.0)
    );

    static String encodeBatch(String metric, String zoneId, String unit, Deque<StampedSample> readings) {
        StringJoiner samplesJson = new StringJoiner(",", "[", "]");
        for (StampedSample sample : readings) {
            samplesJson.add("{\"ts\":\"" + sample.ts() + "\",\"value\":" + sample.value() + "}");
        }
        return "{\"sensor_type\":\"" + metric + "\","
            + "\"site_id\":\"" + zoneId + "\","
            + "\"unit\":\"" + unit + "\","
            + "\"readings\":" + samplesJson + "}";
    }

    public static void main(String[] args) throws Exception {
        String metric = System.getenv("SENSOR_TYPE");
        if (metric == null) throw new IllegalStateException("SENSOR_TYPE env var is required");
        String zoneId = System.getenv().getOrDefault("SITE_ID", "zone-1");
        double sampleInterval = Double.parseDouble(System.getenv().getOrDefault("SAMPLE_INTERVAL", "2"));
        double dispatchInterval = Double.parseDouble(System.getenv().getOrDefault("DISPATCH_INTERVAL", "10"));
        String fogUrl = System.getenv().getOrDefault("FOG_URL", "http://fog:8000/ingest");

        Profile profile = METRIC_PROFILES.get(metric);
        if (profile == null) throw new IllegalStateException("unknown SENSOR_TYPE: " + metric);

        HttpClient http = HttpClient.newHttpClient();
        RandomGenerator rng = ThreadLocalRandom.current();
        AtomicReference<Double> level = new AtomicReference<>(profile.start());
        Deque<StampedSample> buffer = new ArrayDeque<>();

        System.out.printf("%s@%s sampling every %ss, dispatching every %ss%n", metric, zoneId, sampleInterval, dispatchInterval);

        ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

        scheduler.scheduleAtFixedRate(() -> {
            double nextLevel = profile.nextFrom(level.get(), rng);
            level.set(nextLevel);
            synchronized (buffer) {
                buffer.addLast(new StampedSample(nextLevel, Instant.now()));
            }
            System.out.printf("%s sampled %.2f%n", metric, nextLevel);
        }, 0, (long) (sampleInterval * 1000), TimeUnit.MILLISECONDS);

        scheduler.scheduleAtFixedRate(() -> {
            Deque<StampedSample> drained;
            synchronized (buffer) {
                if (buffer.isEmpty()) return;
                drained = new ArrayDeque<>(buffer);
                buffer.clear();
            }
            String body = encodeBatch(metric, zoneId, profile.unit(), drained);
            try {
                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(fogUrl))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(5))
                    .build();
                http.send(request, HttpResponse.BodyHandlers.discarding());
                System.out.printf("%s dispatched %d readings%n", metric, drained.size());
            } catch (Exception exc) {
                System.out.printf("%s dispatch failed, will retry: %s%n", metric, exc.getMessage());
            }
        }, (long) (dispatchInterval * 1000), (long) (dispatchInterval * 1000), TimeUnit.MILLISECONDS);

        new CountDownLatch(1).await();
    }
}
