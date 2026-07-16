package com.fec.aquaculture.fog;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QueuePublisherTest {

    @Test
    void publishBatchChunksAtTenEntriesPerSendMessageBatchCall() {
        FakeSqsClient client = new FakeSqsClient();
        QueuePublisher publisher = new QueuePublisher(client, "aff-pond-agg");

        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 23; i++) payloads.add("{\"n\":" + i + "}");
        publisher.publishBatch(payloads);

        assertEquals(List.of(10, 10, 3), client.batchSizes);
        assertEquals(0, client.singleSendCount, "publishBatch must never fall back to per-message sendMessage");
    }

    @Test
    void publishBatchOfEmptyListSendsNothing() {
        FakeSqsClient client = new FakeSqsClient();
        QueuePublisher publisher = new QueuePublisher(client, "aff-pond-agg");

        publisher.publishBatch(List.of());

        assertTrue(client.batchSizes.isEmpty());
        assertEquals(0, client.getQueueUrlCalls, "an empty batch should not even resolve the queue URL");
    }

    @Test
    void publishBatchOfOneEntryIssuesOneCallOfSizeOne() {
        FakeSqsClient client = new FakeSqsClient();
        QueuePublisher publisher = new QueuePublisher(client, "aff-pond-agg");

        publisher.publishBatch(List.of("{\"n\":1}"));

        assertEquals(List.of(1), client.batchSizes);
    }

    @Test
    void publishSendsASingleMessage() {
        FakeSqsClient client = new FakeSqsClient();
        QueuePublisher publisher = new QueuePublisher(client, "aff-pond-agg");

        publisher.publish("{\"n\":1}");

        assertEquals(1, client.singleSendCount);
        assertTrue(client.batchSizes.isEmpty());
    }
}
