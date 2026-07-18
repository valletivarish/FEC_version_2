package com.fec.transit.fog;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TransitPublisherTest {

    @Test
    void publishBatchChunksAtTenEntriesPerSendMessageBatchCall() {
        FakeSqsClient client = new FakeSqsClient();
        TransitPublisher publisher = new TransitPublisher(client, "http://queue-url");

        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 23; i++) payloads.add("{\"i\":" + i + "}");
        publisher.dispatchBatch(payloads);

        assertEquals(List.of(10, 10, 3), client.batchSizes);
    }

    @Test
    void publishBatchOfEmptyListSendsNothing() {
        FakeSqsClient client = new FakeSqsClient();
        TransitPublisher publisher = new TransitPublisher(client, "http://queue-url");

        publisher.dispatchBatch(List.of());

        assertTrue(client.batchSizes.isEmpty());
    }

    @Test
    void publishBatchOfOneEntryIssuesOneCallOfSizeOne() {
        FakeSqsClient client = new FakeSqsClient();
        TransitPublisher publisher = new TransitPublisher(client, "http://queue-url");

        publisher.dispatchBatch(List.of("{\"only\":true}"));

        assertEquals(List.of(1), client.batchSizes);
    }

    @Test
    void publishBatchOfExactlyTenEntriesIssuesOneCall() {
        FakeSqsClient client = new FakeSqsClient();
        TransitPublisher publisher = new TransitPublisher(client, "http://queue-url");

        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 10; i++) payloads.add("{\"i\":" + i + "}");
        publisher.dispatchBatch(payloads);

        assertEquals(List.of(10), client.batchSizes);
    }
}
