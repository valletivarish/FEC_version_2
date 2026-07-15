package com.fec.mining.sensor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadLocalRandom;

// Two daemon/worker threads handed off through a producer/consumer LinkedBlockingQueue<Reading>.
public class ShaftSensorUnit {

    record Profile(String unit, double lo, double hi, double start, double step) {}

    record Reading(String ts, double value) {}

    static final Map<String, Profile> PROFILES = Map.of(
        "methane_ppm",             new Profile("ppm", 0, 5000, 300, 200.0),
        "co_ppm",                  new Profile("ppm", 0, 500, 15, 8.0),
        "dust_concentration_mgm3", new Profile("mg/m3", 0, 50, 5, 2.0),
        "ground_vibration_mms",    new Profile("mm/s", 0, 50, 3, 2.5),
        "ambient_temp_c",          new Profile("C", 15, 45, 26, 1.5)
    );

    static double clamp(double value, double lo, double hi) {
        return Math.max(lo, Math.min(hi, value));
    }

    // Bounded random walk from the previous value, so samples trend like real telemetry rather than white noise.
    static double nextValue(double current, Profile profile) {
        double delta = ThreadLocalRandom.current().nextDouble(-profile.step(), profile.step());
        double moved = clamp(current + delta, profile.lo(), profile.hi());
        return Math.round(moved * 100.0) / 100.0;
    }

    static String toJson(String sensorType, String siteId, String unit, List<Reading> batch) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"sensor_type\":\"").append(sensorType).append("\",");
        sb.append("\"site_id\":\"").append(siteId).append("\",");
        sb.append("\"unit\":\"").append(unit).append("\",");
        sb.append("\"readings\":[");
        for (int i = 0; i < batch.size(); i++) {
            if (i > 0) sb.append(",");
            Reading r = batch.get(i);
            sb.append("{\"ts\":\"").append(r.ts()).append("\",\"value\":").append(r.value()).append("}");
        }
        sb.append("]}");
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        String sensorType = System.getenv("SENSOR_TYPE");
        if (sensorType == null) throw new IllegalStateException("SENSOR_TYPE env var is required");
        String siteId = System.getenv().getOrDefault("SITE_ID", "shaft-a");
        double sampleInterval = Double.parseDouble(System.getenv().getOrDefault("SAMPLE_INTERVAL", "2"));
        double dispatchInterval = Double.parseDouble(System.getenv().getOrDefault("DISPATCH_INTERVAL", "10"));
        String fogUrl = System.getenv().getOrDefault("FOG_URL", "http://fog:8000/ingest");

        Profile profile = PROFILES.get(sensorType);
        if (profile == null) throw new IllegalStateException("unknown SENSOR_TYPE: " + sensorType);

        LinkedBlockingQueue<Reading> queue = new LinkedBlockingQueue<>();
        HttpClient client = HttpClient.newHttpClient();
        long sampleMillis = (long) (sampleInterval * 1000);
        long dispatchMillis = (long) (dispatchInterval * 1000);

        Thread sampleThread = new Thread(() -> {
            double value = profile.start();
            while (true) {
                value = nextValue(value, profile);
                queue.offer(new Reading(Instant.now().toString(), value));
                try {
                    Thread.sleep(sampleMillis);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }, "sample-" + sensorType);
        sampleThread.setDaemon(true);

        // Non-daemon: this thread's loop is what keeps the JVM alive until join() returns.
        Thread dispatchThread = new Thread(() -> {
            while (true) {
                try {
                    Thread.sleep(dispatchMillis);
                } catch (InterruptedException e) {
                    return;
                }
                List<Reading> batch = new ArrayList<>();
                queue.drainTo(batch);
                if (batch.isEmpty()) continue;
                try {
                    HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(fogUrl))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(toJson(sensorType, siteId, profile.unit(), batch)))
                        .timeout(Duration.ofSeconds(5))
                        .build();
                    client.send(request, HttpResponse.BodyHandlers.discarding());
                    System.out.printf("%s dispatched %d readings%n", sensorType, batch.size());
                } catch (Exception exc) {
                    // Put the batch back so the next dispatch cycle retries it.
                    queue.addAll(batch);
                    System.out.printf("%s dispatch failed, will retry: %s%n", sensorType, exc.getMessage());
                }
            }
        }, "dispatch-" + sensorType);

        System.out.printf("%s@%s sampling every %ss, dispatching every %ss%n", sensorType, siteId, sampleInterval, dispatchInterval);
        sampleThread.start();
        dispatchThread.start();
        dispatchThread.join();
    }
}
