package com.fec.mining.processor;

import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SafetyHandlerTest {

    static final String MESSAGE = "{\"sensor_type\":\"co_ppm\",\"site_id\":\"shaft-a\",\"unit\":\"ppm\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":3,\"min\":20.0,\"max\":80.0,\"avg\":60.0," +
        "\"latest\":75.0,\"alerts\":[\"co_exposure_risk\"]}";

    static SQSEvent.SQSMessage message(String body) {
        SQSEvent.SQSMessage m = new SQSEvent.SQSMessage();
        m.setBody(body);
        return m;
    }

    @Test
    void processRecordsWritesEachRecord() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = SafetyHandler.processRecords(List.of(message(MESSAGE)), fake, "test-table");

        assertEquals(1, processed);
        assertEquals(1, fake.puts.size());
        assertEquals("test-table", fake.puts.get(0).tableName());
        assertEquals("co_ppm", fake.puts.get(0).item().get("sensor_type").s());
    }

    @Test
    void processRecordsHandlesABatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = SafetyHandler.processRecords(List.of(message(MESSAGE), message(MESSAGE)), fake, "test-table");

        assertEquals(2, processed);
        assertEquals(2, fake.puts.size());
    }

    @Test
    void malformedRecordThrowsAndFailsTheWholeBatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        assertThrows(RuntimeException.class, () ->
            SafetyHandler.processRecords(List.of(message("not json")), fake, "test-table"));
    }
}
