package com.fec.retail.fog;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class QueuePublisherTest {

    @Test
    void publishSendsASingleMessage() {
        FakeSqsClient sqs = new FakeSqsClient();
        QueuePublisher publisher = new QueuePublisher(sqs, "http://queue-url");

        publisher.publish("{\"sensor_type\":\"footfall_count\"}");

        assertEquals(1, sqs.singleSends.size());
        assertEquals("{\"sensor_type\":\"footfall_count\"}", sqs.singleSends.get(0).messageBody());
    }

    @Test
    void publishBatchChunksTwentyThreePayloadsIntoTenTenThree() {
        FakeSqsClient sqs = new FakeSqsClient();
        QueuePublisher publisher = new QueuePublisher(sqs, "http://queue-url");

        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 23; i++) payloads.add("payload-" + i);
        publisher.publishBatch(payloads);

        assertEquals(3, sqs.batchSends.size());
        List<Integer> sizes = sqs.batchSends.stream().map(r -> r.entries().size()).toList();
        assertEquals(List.of(10, 10, 3), sizes);

        int total = sqs.batchSends.stream().mapToInt(r -> r.entries().size()).sum();
        assertEquals(23, total);
    }

    @Test
    void publishBatchOfEmptyListSendsNothing() {
        FakeSqsClient sqs = new FakeSqsClient();
        QueuePublisher publisher = new QueuePublisher(sqs, "http://queue-url");

        publisher.publishBatch(List.of());

        assertTrue(sqs.batchSends.isEmpty());
    }

    @Test
    void publishBatchOfExactlyTenEntriesIssuesOneCall() {
        FakeSqsClient sqs = new FakeSqsClient();
        QueuePublisher publisher = new QueuePublisher(sqs, "http://queue-url");

        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 10; i++) payloads.add("payload-" + i);
        publisher.publishBatch(payloads);

        assertEquals(1, sqs.batchSends.size());
        assertEquals(10, sqs.batchSends.get(0).entries().size());
    }
}
