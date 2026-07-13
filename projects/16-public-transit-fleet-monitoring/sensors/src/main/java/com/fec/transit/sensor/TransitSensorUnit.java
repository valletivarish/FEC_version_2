package com.fec.transit.sensor;

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
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

/** Two independent java.util.Timer/TimerTask pairs driven by scheduleAtFixedRate, each on its own thread, so a slow dispatch POST never delays the next sample tick -- the sixth distinct Java sensor-loop scheduling mechanism in this CA portfolio. */
public class TransitSensorUnit {

    record Metric(String unit, RandomWalk walk, double start) {}

    static final Map<String, Metric> METRICS = new LinkedHashMap<>();
    static {
        METRICS.put("engine_temp_c", new Metric("C", new RandomWalk(60, 120, 3.0), 85));
        METRICS.put("brake_pad_wear_pct", new Metric("%", new RandomWalk(0, 100, 4.0), 20));
        METRICS.put("passenger_count", new Metric("people", new RandomWalk(0, 80, 10.0), 30));
        METRICS.put("fuel_level_pct", new Metric("%", new RandomWalk(0, 100, 5.0), 70));
        METRICS.put("gps_speed_kmh", new Metric("km/h", new RandomWalk(0, 100, 8.0), 35));
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

        String siteId = System.getenv().getOrDefault("SITE_ID", "depot-a");
        long sampleMillis = (long) (Double.parseDouble(System.getenv().getOrDefault("SAMPLE_INTERVAL", "2")) * 1000);
        long dispatchMillis = (long) (Double.parseDouble(System.getenv().getOrDefault("DISPATCH_INTERVAL", "10")) * 1000);
        String fogUrl = System.getenv().getOrDefault("FOG_URL", "http://fog:8000/ingest");

        System.out.printf("%s@%s sampling every %dms, dispatching every %dms%n", sensorType, siteId, sampleMillis, dispatchMillis);

        HttpClient client = HttpClient.newHttpClient();
        AtomicReference<Double> current = new AtomicReference<>(profile.start());
        List<Sample> buffer = new ArrayList<>();

        Timer sampleTimer = new Timer("transit-sample-" + sensorType, true);
        Timer dispatchTimer = new Timer("transit-dispatch-" + sensorType, true);

        TimerTask sampleTask = new TimerTask() {
            @Override
            public void run() {
                double next = profile.walk().advance(current.get());
                current.set(next);
                synchronized (buffer) {
                    buffer.add(new Sample(Instant.now(), next));
                }
            }
        };

        TimerTask dispatchTask = new TimerTask() {
            @Override
            public void run() {
                List<Sample> snapshot;
                synchronized (buffer) {
                    if (buffer.isEmpty()) return;
                    snapshot = new ArrayList<>(buffer);
                }
                String body = payload(sensorType, siteId, profile.unit(), snapshot);
                // Only cleared on a confirmed dispatch, so a failed POST
                // leaves the readings buffered for the next tick to retry
                // instead of silently dropping them.
                if (dispatch(client, fogUrl, body)) {
                    synchronized (buffer) {
                        buffer.subList(0, snapshot.size()).clear();
                    }
                    System.out.printf("%s dispatched %d readings%n", sensorType, snapshot.size());
                }
            }
        };

        sampleTimer.scheduleAtFixedRate(sampleTask, 0, sampleMillis);
        dispatchTimer.scheduleAtFixedRate(dispatchTask, dispatchMillis, dispatchMillis);

        new CountDownLatch(1).await();
    }
}
