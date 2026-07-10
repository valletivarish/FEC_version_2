package com.fec.port.sensor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

/**
 * Simulates one sensor type at one berth. Every other Java sensor sibling in
 * this portfolio schedules sampling/dispatching with either a single
 * while(true) loop juggling two "next fire" deadlines with an adaptive short
 * sleep (02, 07, 08, 09), two tasks on a shared 2-thread
 * ScheduledExecutorService (04), two java.util.Timer instances (16), or two
 * raw Thread objects handed off through a LinkedBlockingQueue (19). This
 * class uses none of those: sampling and dispatching are two independent
 * chains of one-shot Runnable tasks that each reschedule themselves via
 * scheduler.schedule(...) at the END of their own run() (not
 * scheduleAtFixedRate), both submitted to the SAME
 * Executors.newSingleThreadScheduledExecutor(). Because that executor only
 * ever runs one task at a time, the two chains can never execute
 * concurrently with each other, so the shared "buffer" list needs no lock,
 * no synchronized block and no concurrent collection anywhere in this class
 * -- a real, different consequence from every sibling above, all of which
 * need explicit synchronization (or a queue-based hand-off) because their
 * two chains genuinely can run at the same time. The trade-off: a slow
 * dispatch HTTP call delays the next sample tick, since both chains queue up
 * behind the same worker thread; DISPATCH_INTERVAL's 5s HTTP timeout bounds
 * how bad that delay can get.
 */
public class BerthSensorUnit {

    record Profile(String unit, double lo, double hi, double start, double step) {}

    record Reading(String ts, double value) {}

    static final Map<String, Profile> PROFILES = Map.of(
        "crane_load_kg",           new Profile("kg", 0, 40000, 15000, 3000.0),
        "container_stack_height",  new Profile("count", 0, 8, 3, 1.0),
        "wind_speed_knots",        new Profile("knots", 0, 60, 12, 4.0),
        "berth_occupancy_pct",     new Profile("%", 0, 100, 45, 8.0),
        "reefer_temp_c",           new Profile("C", -25, 10, -18, 1.0)
    );

    static double clamp(double value, double lo, double hi) {
        return Math.max(lo, Math.min(hi, value));
    }

    // Bounded random walk from the previous value, not a fresh draw each
    // tick, so consecutive samples stay close together like a real sensor
    // trace -- this is what makes the fog's windowed min/max/avg and the
    // dashboard trend line look like plausible terminal telemetry rather
    // than white noise.
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

    /** Self-rescheduling sample chain: appends one reading, then re-arms itself for sampleMillis later. */
    private static final class SampleTask implements Runnable {
        private final Profile profile;
        private final List<Reading> buffer;
        private final ScheduledExecutorService scheduler;
        private final long sampleMillis;
        private double value;

        SampleTask(Profile profile, List<Reading> buffer, ScheduledExecutorService scheduler, long sampleMillis) {
            this.profile = profile;
            this.buffer = buffer;
            this.scheduler = scheduler;
            this.sampleMillis = sampleMillis;
            this.value = profile.start();
        }

        @Override
        public void run() {
            value = nextValue(value, profile);
            buffer.add(new Reading(Instant.now().toString(), value));
            scheduler.schedule(this, sampleMillis, TimeUnit.MILLISECONDS);
        }
    }

    /** Self-rescheduling dispatch chain: drains the buffer and POSTs it, then re-arms itself for dispatchMillis later. */
    private static final class DispatchTask implements Runnable {
        private final String sensorType;
        private final String siteId;
        private final Profile profile;
        private final List<Reading> buffer;
        private final HttpClient client;
        private final String fogUrl;
        private final ScheduledExecutorService scheduler;
        private final long dispatchMillis;

        DispatchTask(String sensorType, String siteId, Profile profile, List<Reading> buffer, HttpClient client,
                      String fogUrl, ScheduledExecutorService scheduler, long dispatchMillis) {
            this.sensorType = sensorType;
            this.siteId = siteId;
            this.profile = profile;
            this.buffer = buffer;
            this.client = client;
            this.fogUrl = fogUrl;
            this.scheduler = scheduler;
            this.dispatchMillis = dispatchMillis;
        }

        @Override
        public void run() {
            if (!buffer.isEmpty()) {
                List<Reading> batch = new ArrayList<>(buffer);
                buffer.clear();
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
                    // No other thread can touch buffer while this task runs
                    // (single-thread executor), so putting the batch back is
                    // race-free even without a lock.
                    buffer.addAll(0, batch);
                    System.out.printf("%s dispatch failed, will retry: %s%n", sensorType, exc.getMessage());
                }
            }
            scheduler.schedule(this, dispatchMillis, TimeUnit.MILLISECONDS);
        }
    }

    public static void main(String[] args) throws Exception {
        String sensorType = System.getenv("SENSOR_TYPE");
        if (sensorType == null) throw new IllegalStateException("SENSOR_TYPE env var is required");
        String siteId = System.getenv().getOrDefault("SITE_ID", "berth-a");
        double sampleInterval = Double.parseDouble(System.getenv().getOrDefault("SAMPLE_INTERVAL", "2"));
        double dispatchInterval = Double.parseDouble(System.getenv().getOrDefault("DISPATCH_INTERVAL", "10"));
        String fogUrl = System.getenv().getOrDefault("FOG_URL", "http://fog:8000/ingest");

        Profile profile = PROFILES.get(sensorType);
        if (profile == null) throw new IllegalStateException("unknown SENSOR_TYPE: " + sensorType);

        List<Reading> buffer = new ArrayList<>();
        HttpClient client = HttpClient.newHttpClient();
        long sampleMillis = (long) (sampleInterval * 1000);
        long dispatchMillis = (long) (dispatchInterval * 1000);

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        SampleTask sampleTask = new SampleTask(profile, buffer, scheduler, sampleMillis);
        DispatchTask dispatchTask = new DispatchTask(sensorType, siteId, profile, buffer, client, fogUrl, scheduler, dispatchMillis);

        System.out.printf("%s@%s sampling every %ss, dispatching every %ss%n", sensorType, siteId, sampleInterval, dispatchInterval);
        scheduler.schedule(sampleTask, sampleMillis, TimeUnit.MILLISECONDS);
        scheduler.schedule(dispatchTask, dispatchMillis, TimeUnit.MILLISECONDS);

        new CountDownLatch(1).await();
    }
}
