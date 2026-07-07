package com.fec.retail.processor;

import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class StoreHandlerTest {

    static final String MESSAGE = "{\"sensor_type\":\"fridge_temp_c\",\"site_id\":\"store-1\",\"unit\":\"C\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":3,\"min\":6.0,\"max\":9.0,\"avg\":7.5," +
        "\"latest\":8.0,\"alerts\":[\"cold_chain_risk\"]}";

    static SQSEvent.SQSMessage message(String body) {
        SQSEvent.SQSMessage m = new SQSEvent.SQSMessage();
        m.setBody(body);
        return m;
    }

    @Test
    void processRecordsWritesEachRecord() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        Tally tally = StoreHandler.processRecords(List.of(message(MESSAGE)), fake, "test-table");

        assertEquals(1, tally.written());
        assertTrue(tally.clean());
        assertEquals(1, fake.puts.size());
        assertEquals("test-table", fake.puts.get(0).tableName());
        assertEquals("fridge_temp_c", fake.puts.get(0).item().get("sensor_type").s());
    }

    @Test
    void processRecordsHandlesBatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        Tally tally = StoreHandler.processRecords(List.of(message(MESSAGE), message(MESSAGE)), fake, "test-table");

        assertEquals(2, tally.written());
        assertEquals(2, fake.puts.size());
    }

    @Test
    void processRecordsCollectsFailuresWithoutStoppingBatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(true);
        Tally tally = StoreHandler.processRecords(List.of(message(MESSAGE), message(MESSAGE)), fake, "test-table");

        assertEquals(0, tally.written());
        assertFalse(tally.clean());
        assertEquals(2, tally.failures().size());
    }

    @Test
    void malformedMessageIsRecordedAsFailureNotThrown() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        Tally tally = StoreHandler.processRecords(List.of(message("not json")), fake, "test-table");

        assertFalse(tally.clean());
        assertEquals(0, tally.written());
    }

    @Test
    void mixedBatchWritesGoodRecordsAndReportsBadOnes() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        Tally tally = StoreHandler.processRecords(List.of(message(MESSAGE), message("not json")), fake, "test-table");

        assertEquals(1, tally.written());
        assertEquals(1, tally.failures().size());
        assertEquals(1, fake.puts.size());
    }
}
