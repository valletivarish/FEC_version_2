package com.fec.transit.processor;

import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TransitHandlerTest {

    static final String MESSAGE = "{\"sensor_type\":\"brake_pad_wear_pct\",\"site_id\":\"depot-a\",\"unit\":\"%\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":3,\"min\":75.0,\"max\":85.0,\"avg\":81.0," +
        "\"latest\":85.0,\"alerts\":[\"brake_service_required\"]}";

    static SQSEvent.SQSMessage message(String body) {
        SQSEvent.SQSMessage m = new SQSEvent.SQSMessage();
        m.setBody(body);
        return m;
    }

    @Test
    void processRecordsWritesEachRecord() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = TransitHandler.storeWindows(List.of(message(MESSAGE)), fake, "test-table");

        assertEquals(1, processed);
        assertEquals(1, fake.puts.size());
        assertEquals("test-table", fake.puts.get(0).tableName());
        assertEquals("brake_pad_wear_pct", fake.puts.get(0).item().get("sensor_type").s());
    }

    @Test
    void processRecordsWritesAWholeBatchInOrder() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = TransitHandler.storeWindows(
            List.of(message(MESSAGE), message(MESSAGE), message(MESSAGE)), fake, "test-table");

        assertEquals(3, processed);
        assertEquals(3, fake.puts.size());
    }

    @Test
    void emptyBatchProcessesNothing() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = TransitHandler.storeWindows(List.of(), fake, "test-table");
        assertEquals(0, processed);
        assertEquals(0, fake.puts.size());
    }

    @Test
    void aWriteFailureThrowsSoSqsRetriesTheWholeBatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(true);
        assertThrows(RuntimeException.class,
            () -> TransitHandler.storeWindows(List.of(message(MESSAGE)), fake, "test-table"));
    }

    @Test
    void aMalformedMessageThrowsRatherThanSilentlySkipping() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        assertThrows(RuntimeException.class,
            () -> TransitHandler.storeWindows(List.of(message("not json")), fake, "test-table"));
    }
}
