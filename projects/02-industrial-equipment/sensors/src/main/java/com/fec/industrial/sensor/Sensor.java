package com.fec.industrial.sensor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

public class Sensor {

    record Profile(String unit, double lo, double hi, double start, double step) {}

    static final Map<String, Profile> PROFILES = Map.of(
        "vibration",         new Profile("mm/s", 0.2, 9.0, 2.0, 0.4),
        "motor_temperature", new Profile("C", 30, 110, 65, 3.0),
        "bearing_acoustic",  new Profile("dB", 40, 100, 60, 4.0),
        "rotation_speed",    new Profile("RPM", 800, 3600, 1800, 80),
        "power_draw",        new Profile("kW", 5, 75, 35, 5.0)
    );

    static double clamp(double value, double lo, double hi) {
        return Math.max(lo, Math.min(hi, value));
    }

    // Values walk randomly from the previous reading (a bounded random walk)
    // rather than being drawn fresh each tick, so consecutive samples stay
    // close together like a real sensor trace instead of jumping erratically
    // -- this is what makes the fog's windowed min/max/avg and the dashboard
    // sparkline look like plausible equipment telemetry.
    static double nextValue(double current, Profile profile) {
        double delta = ThreadLocalRandom.current().nextDouble(-profile.step(), profile.step());
        double moved = clamp(current + delta, profile.lo(), profile.hi());
        return Math.round(moved * 100.0) / 100.0;
    }

    static String toJson(String sensorType, String siteId, String unit, List<double[]> readings, List<Instant> timestamps) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"sensor_type\":\"").append(sensorType).append("\",");
        sb.append("\"site_id\":\"").append(siteId).append("\",");
        sb.append("\"unit\":\"").append(unit).append("\",");
        sb.append("\"readings\":[");
        for (int i = 0; i < readings.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append("{\"ts\":\"").append(timestamps.get(i)).append("\",");
            sb.append("\"value\":").append(readings.get(i)[0]).append("}");
        }
        sb.append("]}");
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        String sensorType = System.getenv("SENSOR_TYPE");
        if (sensorType == null) throw new IllegalStateException("SENSOR_TYPE env var is required");
        String siteId = System.getenv().getOrDefault("SITE_ID", "line-1");
        double sampleInterval = Double.parseDouble(System.getenv().getOrDefault("SAMPLE_INTERVAL", "2"));
        double dispatchInterval = Double.parseDouble(System.getenv().getOrDefault("DISPATCH_INTERVAL", "10"));
        String fogUrl = System.getenv().getOrDefault("FOG_URL", "http://fog:8000/ingest");

        Profile profile = PROFILES.get(sensorType);
        if (profile == null) throw new IllegalStateException("unknown SENSOR_TYPE: " + sensorType);

        HttpClient client = HttpClient.newHttpClient();
        double value = profile.start();
        List<double[]> buffer = new ArrayList<>();
        List<Instant> timestamps = new ArrayList<>();
        long lastDispatch = System.nanoTime();

        System.out.printf("%s@%s sampling every %ss, dispatching every %ss%n", sensorType, siteId, sampleInterval, dispatchInterval);

        while (true) {
            value = nextValue(value, profile);
            buffer.add(new double[]{value});
            timestamps.add(Instant.now());

            double elapsedSeconds = (System.nanoTime() - lastDispatch) / 1_000_000_000.0;
            if (elapsedSeconds >= dispatchInterval && !buffer.isEmpty()) {
                String body = toJson(sensorType, siteId, profile.unit(), buffer, timestamps);
                try {
                    HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(fogUrl))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .timeout(Duration.ofSeconds(5))
                        .build();
                    client.send(request, HttpResponse.BodyHandlers.discarding());
                    System.out.printf("%s dispatched %d readings%n", sensorType, buffer.size());
                    buffer.clear();
                    timestamps.clear();
                    lastDispatch = System.nanoTime();
                } catch (Exception exc) {
                    System.out.printf("%s dispatch failed, will retry: %s%n", sensorType, exc.getMessage());
                }
            }

            Thread.sleep((long) (sampleInterval * 1000));
        }
    }
}
