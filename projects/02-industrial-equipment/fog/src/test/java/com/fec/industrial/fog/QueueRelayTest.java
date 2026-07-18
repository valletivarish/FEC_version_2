package com.fec.industrial.fog;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class QueueRelayTest {

    @Test
    void emitSendsASingleMessage() {
        FakeSqsClient client = new FakeSqsClient();
        QueueRelay relay = new QueueRelay(client, "http://queue-url");

        relay.relaySingle("{\"sensor_type\":\"vibration\"}");

        assertEquals(List.of("{\"sensor_type\":\"vibration\"}"), client.singleSends);
        assertTrue(client.batchSizes.isEmpty());
    }

    @Test
    void emitBatchChunksA23PayloadWindowIntoTenTenThree() {
        FakeSqsClient client = new FakeSqsClient();
        QueueRelay relay = new QueueRelay(client, "http://queue-url");
        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 23; i++) payloads.add("{\"i\":" + i + "}");

        relay.relayWindow(payloads);

        assertEquals(List.of(10, 10, 3), client.batchSizes);
        assertTrue(client.singleSends.isEmpty(), "batching must not fall back to per-message sendMessage calls");
    }

    @Test
    void emitBatchOfEmptyWindowSendsNothing() {
        FakeSqsClient client = new FakeSqsClient();
        QueueRelay relay = new QueueRelay(client, "http://queue-url");

        relay.relayWindow(List.of());

        assertTrue(client.batchSizes.isEmpty());
    }

    @Test
    void emitBatchOfExactlyTenIssuesOneCall() {
        FakeSqsClient client = new FakeSqsClient();
        QueueRelay relay = new QueueRelay(client, "http://queue-url");
        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 10; i++) payloads.add("{\"i\":" + i + "}");

        relay.relayWindow(payloads);

        assertEquals(List.of(10), client.batchSizes);
    }

    @Test
    void emitBatchOfElevenSpillsTheEleventhIntoASecondCall() {
        FakeSqsClient client = new FakeSqsClient();
        QueueRelay relay = new QueueRelay(client, "http://queue-url");
        List<String> payloads = new ArrayList<>();
        for (int i = 0; i < 11; i++) payloads.add("{\"i\":" + i + "}");

        relay.relayWindow(payloads);

        assertEquals(List.of(10, 1), client.batchSizes);
    }

    @Test
    void relayWindowForwardsEveryPayloadBodyUnaltered() {
        FakeSqsClient client = new FakeSqsClient();
        QueueRelay relay = new QueueRelay(client, "http://queue-url");
        List<String> payloads = List.of("{\"sensor_type\":\"vibration\"}", "{\"sensor_type\":\"power_draw\"}");

        relay.relayWindow(payloads);

        assertEquals(payloads, client.batchBodies);
    }
}
