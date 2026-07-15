package com.fec.mining.fog;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;

import static org.junit.jupiter.api.Assertions.*;

class SafetyPublisherTest {

    @Test
    void emitSendsASingleMessage() throws ExecutionException, InterruptedException {
        ShaftQueueSpy spy = new ShaftQueueSpy();
        SafetyPublisher publisher = new SafetyPublisher(spy, "msm-shaft-agg");
        publisher.emit("{\"sensor_type\":\"methane_ppm\"}").get();
        assertEquals(1, spy.singleRequests.size());
        assertEquals("{\"sensor_type\":\"methane_ppm\"}", spy.singleRequests.get(0).messageBody());
    }

    @Test
    void emitBatchChunksA27MessageWindowIntoBatchesOfTenTenAndSeven() throws ExecutionException, InterruptedException {
        ShaftQueueSpy spy = new ShaftQueueSpy();
        SafetyPublisher publisher = new SafetyPublisher(spy, "msm-shaft-agg");
        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 27; i++) payloads.add("{\"i\":" + i + "}");

        publisher.emitBatch(payloads).get();

        assertEquals(3, spy.batchRequests.size());
        List<Integer> chunkSizes = spy.batchRequests.stream().map(r -> r.entries().size()).sorted().toList();
        assertEquals(List.of(7, 10, 10), chunkSizes);

        int totalEntries = spy.batchRequests.stream().mapToInt(r -> r.entries().size()).sum();
        assertEquals(27, totalEntries, "every payload must be sent exactly once across all batches");
    }

    @Test
    void emitBatchDoesNothingAndNeverLooksUpTheQueueForAnEmptyWindow() {
        ShaftQueueSpy spy = new ShaftQueueSpy();
        SafetyPublisher publisher = new SafetyPublisher(spy, "msm-shaft-agg");
        assertDoesNotThrow(() -> publisher.emitBatch(List.of()).get());
        assertEquals(0, spy.batchRequests.size());
        assertEquals(0, spy.queueUrlLookups());
    }
}
