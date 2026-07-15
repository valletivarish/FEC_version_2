package com.fec.warehouse.fog;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RelayPublisherTest {

    @Test
    void publishSendsASingleMessage() {
        RelaySqsSpy spy = new RelaySqsSpy();
        RelayPublisher publisher = new RelayPublisher(spy, "http://queue-url");

        publisher.publish("{\"sensor_type\":\"motor_temp_c\"}");

        assertEquals(1, spy.singleRequests.size());
        assertEquals("{\"sensor_type\":\"motor_temp_c\"}", spy.singleRequests.get(0).messageBody());
    }

    @Test
    void publishBatchChunksA24MessageWindowIntoBatchesOfTenTenAndFour() {
        RelaySqsSpy spy = new RelaySqsSpy();
        RelayPublisher publisher = new RelayPublisher(spy, "http://queue-url");

        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 24; i++) payloads.add("payload-" + i);
        publisher.publishBatch(payloads);

        assertEquals(3, spy.batchRequests.size());
        List<Integer> chunkSizes = spy.batchRequests.stream().map(r -> r.entries().size()).sorted().toList();
        assertEquals(List.of(4, 10, 10), chunkSizes);

        int totalEntries = spy.batchRequests.stream().mapToInt(r -> r.entries().size()).sum();
        assertEquals(24, totalEntries);
    }

    @Test
    void publishBatchDoesNothingForAnEmptyWindow() {
        RelaySqsSpy spy = new RelaySqsSpy();
        RelayPublisher publisher = new RelayPublisher(spy, "http://queue-url");

        publisher.publishBatch(List.of());

        assertEquals(0, spy.batchRequests.size());
    }
}
