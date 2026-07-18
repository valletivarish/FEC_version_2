package com.fec.transit.fog;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IntakeQueueTest {

    @Test
    void drainAndGroupGroupsBySensorTypeAndSiteId() {
        IntakeQueue queue = new IntakeQueue();
        queue.enqueue(new ReadingEvent("engine_temp_c", "depot-a", "C", 88.0));
        queue.enqueue(new ReadingEvent("engine_temp_c", "depot-a", "C", 90.0));
        queue.enqueue(new ReadingEvent("engine_temp_c", "depot-b", "C", 95.0));

        Map<GroupKey, List<ReadingEvent>> grouped = queue.drainByGroup();
        assertEquals(2, grouped.size());
        assertEquals(2, grouped.get(new GroupKey("engine_temp_c", "depot-a")).size());
        assertEquals(1, grouped.get(new GroupKey("engine_temp_c", "depot-b")).size());
    }

    @Test
    void distinctSensorTypesAtTheSameDepotStayInSeparateGroups() {
        IntakeQueue queue = new IntakeQueue();
        queue.enqueue(new ReadingEvent("engine_temp_c", "depot-a", "C", 88.0));
        queue.enqueue(new ReadingEvent("fuel_level_pct", "depot-a", "%", 70.0));

        Map<GroupKey, List<ReadingEvent>> grouped = queue.drainByGroup();
        assertEquals(2, grouped.size());
    }

    @Test
    void drainAndGroupEmptiesTheQueueSoASecondDrainIsEmpty() {
        IntakeQueue queue = new IntakeQueue();
        queue.enqueue(new ReadingEvent("gps_speed_kmh", "depot-a", "km/h", 42.0));
        assertEquals(1, queue.drainByGroup().size());
        assertTrue(queue.drainByGroup().isEmpty());
    }

    @Test
    void groupPreservesArrivalOrderSoLastElementIsTheMostRecentReading() {
        IntakeQueue queue = new IntakeQueue();
        queue.enqueue(new ReadingEvent("passenger_count", "depot-a", "people", 20.0));
        queue.enqueue(new ReadingEvent("passenger_count", "depot-a", "people", 55.0));
        queue.enqueue(new ReadingEvent("passenger_count", "depot-a", "people", 10.0));

        List<ReadingEvent> events = queue.drainByGroup().get(new GroupKey("passenger_count", "depot-a"));
        assertEquals(10.0, events.get(events.size() - 1).value());
    }

    @Test
    void concurrentIngestFromManyThreadsLosesNoReadings() throws InterruptedException {
        IntakeQueue queue = new IntakeQueue();
        int threads = 32;
        int perThread = 200;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger started = new AtomicInteger();

        for (int t = 0; t < threads; t++) {
            pool.submit(() -> {
                started.incrementAndGet();
                ready.countDown();
                try {
                    go.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                for (int i = 0; i < perThread; i++) {
                    queue.enqueue(new ReadingEvent("brake_pad_wear_pct", "depot-a", "%", i));
                }
            });
        }
        ready.await();
        go.countDown();
        pool.shutdown();
        assertTrue(pool.awaitTermination(10, java.util.concurrent.TimeUnit.SECONDS));

        Map<GroupKey, List<ReadingEvent>> grouped = queue.drainByGroup();
        assertEquals(threads * perThread, grouped.get(new GroupKey("brake_pad_wear_pct", "depot-a")).size(),
            "no reading should be lost to a race between concurrent offer() calls");
    }
}
