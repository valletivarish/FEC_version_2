package com.fec.aquaculture.fog;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReadingAccumulatorTest {

    @Test
    void combineConcatenatesValuesFromBothSides() {
        ReadingAccumulator a = ReadingAccumulator.of(List.of(1.0, 2.0), "mg/L");
        ReadingAccumulator b = ReadingAccumulator.of(List.of(3.0), "mg/L");
        ReadingAccumulator combined = a.combine(b);
        assertEquals(List.of(1.0, 2.0, 3.0), combined.values());
    }

    @Test
    void combineKeepsExistingUnitWhenBothSidesHaveOne() {
        ReadingAccumulator a = ReadingAccumulator.of(List.of(1.0), "mg/L");
        ReadingAccumulator b = ReadingAccumulator.of(List.of(2.0), "mg/L");
        assertEquals("mg/L", a.combine(b).unit());
    }

    @Test
    void combineFallsBackToOtherSidesUnitWhenFirstIsBlank() {
        ReadingAccumulator a = ReadingAccumulator.of(List.of(1.0), "");
        ReadingAccumulator b = ReadingAccumulator.of(List.of(2.0), "pH");
        assertEquals("pH", a.combine(b).unit());
    }

    @Test
    void combineNeverMutatesEitherOriginalInstance() {
        ReadingAccumulator a = ReadingAccumulator.of(List.of(1.0), "unit");
        ReadingAccumulator b = ReadingAccumulator.of(List.of(2.0), "unit");
        a.combine(b);
        assertEquals(List.of(1.0), a.values());
        assertEquals(List.of(2.0), b.values());
    }

    @Test
    void concurrentMergesOnTheSameKeyLoseNoReadings() throws InterruptedException {
        // Exercises the exact mechanism PondGateway.ingest() relies on:
        // ConcurrentHashMap.merge() atomicity plus an immutable accumulator.
        // 64 threads each merge 50 readings into one shared key; if merge()
        // ever raced, the final count would be less than 3200.
        ConcurrentHashMap<String, ReadingAccumulator> map = new ConcurrentHashMap<>();
        int threads = 64;
        int perThread = 50;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch ready = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);

        for (int t = 0; t < threads; t++) {
            pool.submit(() -> {
                try {
                    ready.await();
                    for (int i = 0; i < perThread; i++) {
                        ReadingAccumulator incoming = ReadingAccumulator.of(List.of(1.0), "unit");
                        map.merge("shared-key", incoming, ReadingAccumulator::combine);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
        }
        ready.countDown();
        assertTrue(done.await(10, TimeUnit.SECONDS), "threads did not finish in time");
        pool.shutdown();

        assertEquals(threads * perThread, map.get("shared-key").values().size());
    }
}
