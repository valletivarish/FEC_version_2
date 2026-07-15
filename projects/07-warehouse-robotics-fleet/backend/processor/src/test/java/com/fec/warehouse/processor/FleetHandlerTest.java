package com.fec.warehouse.processor;

import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FleetHandlerTest {

    static final String MESSAGE = "{\"sensor_type\":\"motor_temp_c\",\"site_id\":\"zone-a\",\"unit\":\"C\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":3,\"min\":40.0,\"max\":50.0,\"avg\":45.0," +
        "\"latest\":48.0,\"alerts\":[\"motor_overheat\"]}";

    static SQSEvent.SQSMessage message(String body) {
        SQSEvent.SQSMessage m = new SQSEvent.SQSMessage();
        m.setBody(body);
        return m;
    }

    @Test
    void processRecordsWritesEachRecord() {
        DynamoWriteSpy spy = new DynamoWriteSpy();
        FleetHandler.BatchTally tally = FleetHandler.processRecords(List.of(message(MESSAGE)), spy, "test-table");

        assertEquals(1, tally.written);
        assertTrue(tally.clean());
        assertEquals(1, spy.puts.size());
        assertEquals("test-table", spy.puts.get(0).tableName());
        assertEquals("motor_temp_c", spy.puts.get(0).item().get("sensor_type").s());
    }

    @Test
    void processRecordsHandlesBatch() {
        DynamoWriteSpy spy = new DynamoWriteSpy();
        FleetHandler.BatchTally tally = FleetHandler.processRecords(List.of(message(MESSAGE), message(MESSAGE)), spy, "test-table");

        assertEquals(2, tally.written);
        assertEquals(2, spy.puts.size());
    }

    @Test
    void processRecordsCollectsFailuresWithoutStoppingBatch() {
        DynamoWriteSpy spy = new DynamoWriteSpy(true);
        FleetHandler.BatchTally tally = FleetHandler.processRecords(List.of(message(MESSAGE), message(MESSAGE)), spy, "test-table");

        assertEquals(0, tally.written);
        assertFalse(tally.clean());
        assertEquals(2, tally.errors.size());
    }

    @Test
    void malformedMessageIsRecordedAsFailureNotThrown() {
        DynamoWriteSpy spy = new DynamoWriteSpy();
        FleetHandler.BatchTally tally = FleetHandler.processRecords(List.of(message("not json")), spy, "test-table");

        assertFalse(tally.clean());
        assertEquals(0, tally.written);
    }
}
