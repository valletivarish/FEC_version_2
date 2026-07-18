package com.fec.industrial.processor;

import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class HandlerTest {

    static final String MESSAGE = "{\"sensor_type\":\"vibration\",\"site_id\":\"line-1\",\"unit\":\"mm/s\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":3,\"min\":6.0,\"max\":8.0,\"avg\":7.5," +
        "\"latest\":7.8,\"alerts\":[\"bearing_wear_risk\"]}";

    static SQSEvent.SQSMessage message(String body) {
        SQSEvent.SQSMessage m = new SQSEvent.SQSMessage();
        m.setBody(body);
        return m;
    }

    @Test
    void processRecordsWritesEachRecord() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = Handler.persistWindows(List.of(message(MESSAGE)), fake, "test-table");

        assertEquals(1, processed);
        assertEquals(1, fake.puts.size());
        assertEquals("test-table", fake.puts.get(0).tableName());
        assertEquals("vibration", fake.puts.get(0).item().get("sensor_type").s());
    }

    @Test
    void processRecordsHandlesBatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        int processed = Handler.persistWindows(List.of(message(MESSAGE), message(MESSAGE)), fake, "test-table");

        assertEquals(2, processed);
        assertEquals(2, fake.puts.size());
    }
}
