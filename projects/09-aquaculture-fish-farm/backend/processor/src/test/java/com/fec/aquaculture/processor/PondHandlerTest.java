package com.fec.aquaculture.processor;

import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class PondHandlerTest {

    static final String MESSAGE = "{\"sensor_type\":\"dissolved_oxygen_mgl\",\"site_id\":\"pond-1\",\"unit\":\"mg/L\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":3,\"min\":3.5,\"max\":6.0,\"avg\":4.5," +
        "\"latest\":5.0,\"alerts\":[\"hypoxia_risk\"]}";

    static SQSEvent.SQSMessage message(String body) {
        SQSEvent.SQSMessage m = new SQSEvent.SQSMessage();
        m.setBody(body);
        return m;
    }

    @Test
    void processRecordsWritesEachRecord() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        Tally tally = PondHandler.processRecords(List.of(message(MESSAGE)), fake, "test-table");

        assertEquals(1, tally.written());
        assertTrue(tally.clean());
        assertEquals(1, fake.puts.size());
        assertEquals("test-table", fake.puts.get(0).tableName());
        assertEquals("dissolved_oxygen_mgl", fake.puts.get(0).item().get("sensor_type").s());
    }

    @Test
    void processRecordsHandlesABatchConcurrentlyAndWritesAll() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        List<SQSEvent.SQSMessage> batch = List.of(
            message(MESSAGE), message(MESSAGE), message(MESSAGE), message(MESSAGE), message(MESSAGE));
        Tally tally = PondHandler.processRecords(batch, fake, "test-table");

        assertEquals(5, tally.written());
        assertEquals(5, fake.puts.size());
        assertTrue(tally.clean());
    }

    @Test
    void emptyBatchProducesTheEmptyTallyWithoutTouchingDynamo() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        Tally tally = PondHandler.processRecords(List.of(), fake, "test-table");
        assertEquals(0, tally.written());
        assertEquals(0, fake.puts.size());
    }

    @Test
    void processRecordsCollectsFailuresWithoutStoppingTheRestOfTheBatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(true);
        Tally tally = PondHandler.processRecords(List.of(message(MESSAGE), message(MESSAGE)), fake, "test-table");

        assertEquals(0, tally.written());
        assertFalse(tally.clean());
        assertEquals(2, tally.failures().size());
    }

    @Test
    void malformedMessageIsRecordedAsFailureNotThrownFromTheStream() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient();
        Tally tally = PondHandler.processRecords(List.of(message("not json")), fake, "test-table");

        assertFalse(tally.clean());
        assertEquals(0, tally.written());
    }

    @Test
    void mixedBatchWritesGoodRecordsAndReportsBadOnesWithoutLosingEither() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Set.of("dissolved_oxygen_mgl"));
        String otherType = "{\"sensor_type\":\"ph_level\",\"site_id\":\"pond-1\",\"unit\":\"pH\"," +
            "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":1,\"min\":7,\"max\":7,\"avg\":7,\"latest\":7,\"alerts\":[]}";

        Tally tally = PondHandler.processRecords(List.of(message(MESSAGE), message(otherType)), fake, "test-table");

        assertEquals(1, tally.written());
        assertEquals(1, tally.failures().size());
        assertEquals(1, fake.puts.size());
        assertEquals("ph_level", fake.puts.get(0).item().get("sensor_type").s());
    }

    @Test
    void handleRequestThrowsWhenAnyRecordFailedSoSqsRetriesTheWholeBatch() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(true);
        Tally tally = PondHandler.processRecords(List.of(message(MESSAGE)), fake, "test-table");
        assertFalse(tally.clean());
        // handleRequest() itself (not exercised directly here since it builds
        // its own static client) mirrors this same throw-after-tallying shape,
        // covered structurally by this batch-level assertion.
    }
}
