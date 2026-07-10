package com.fec.port.processor;

import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TerminalHandlerTest {

    static final String MESSAGE = "{\"sensor_type\":\"reefer_temp_c\",\"site_id\":\"berth-a\",\"unit\":\"C\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":3,\"min\":-20.0,\"max\":-8.0,\"avg\":-9.0," +
        "\"latest\":-8.5,\"alerts\":[\"reefer_temp_breach\"]}";

    static SQSEvent.SQSMessage message(String body) {
        SQSEvent.SQSMessage m = new SQSEvent.SQSMessage();
        m.setBody(body);
        return m;
    }

    @Test
    void processRecordsWritesEachRecord() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = TerminalHandler.processRecords(List.of(message(MESSAGE)), fake, "test-table");

        assertEquals(1, processed);
        assertEquals(1, fake.puts.size());
        assertEquals("test-table", fake.puts.get(0).tableName());
        assertEquals("reefer_temp_c", fake.puts.get(0).item().get("sensor_type").s());
    }

    @Test
    void processRecordsHandlesABatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = TerminalHandler.processRecords(List.of(message(MESSAGE), message(MESSAGE)), fake, "test-table");

        assertEquals(2, processed);
        assertEquals(2, fake.puts.size());
    }

    @Test
    void malformedRecordThrowsAndFailsTheWholeBatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        assertThrows(RuntimeException.class, () ->
            TerminalHandler.processRecords(List.of(message("not json")), fake, "test-table"));
    }
}
