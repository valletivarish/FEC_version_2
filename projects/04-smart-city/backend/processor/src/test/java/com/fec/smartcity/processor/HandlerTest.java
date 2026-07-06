package com.fec.smartcity.processor;

import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HandlerTest {

    static final String READING = "{\"sensor_type\":\"noise_level\",\"site_id\":\"zone-1\",\"unit\":\"dB\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":3,\"min\":65.0,\"max\":85.0,\"avg\":75.0," +
        "\"latest\":80.0,\"alerts\":[\"noise_violation\"]}";

    static final String MALFORMED = "{not-json";

    static SQSEvent.SQSMessage sqsMessageWithBody(String body) {
        SQSEvent.SQSMessage m = new SQSEvent.SQSMessage();
        m.setBody(body);
        return m;
    }

    @Test
    void givenSingleRecord_whenProcessed_thenWrittenOnce() {
        FakeDynamoDbClient fake = FakeDynamoDbClient.recording();

        Handler.Result result = Handler.processRecords(List.of(sqsMessageWithBody(READING)), fake, "test-table");

        assertThat(result.processed()).isEqualTo(1);
        assertThat(fake.puts()).hasSize(1);
        assertThat(fake.puts().get(0).tableName()).isEqualTo("test-table");
        assertThat(fake.puts().get(0).item().get("sensor_type").s()).isEqualTo("noise_level");
    }

    @Test
    void givenTwoRecords_whenProcessed_thenBothWritten() {
        FakeDynamoDbClient fake = FakeDynamoDbClient.recording();

        Handler.Result result = Handler.processRecords(
            List.of(sqsMessageWithBody(READING), sqsMessageWithBody(READING)), fake, "test-table");

        assertThat(result.processed()).isEqualTo(2);
        assertThat(fake.puts()).hasSize(2);
    }

    @Test
    void givenOnlyValidRecords_whenProcessed_thenResultReportsNoFailures() {
        FakeDynamoDbClient fake = FakeDynamoDbClient.recording();

        Handler.Result result = Handler.processRecords(List.of(sqsMessageWithBody(READING)), fake, "test-table");

        assertThat(result.hasFailures()).isFalse();
        assertThat(result.failures()).isEmpty();
    }

    @Test
    void givenMixOfValidAndInvalidRecords_whenProcessed_thenResultPartitionsCounts() {
        FakeDynamoDbClient fake = FakeDynamoDbClient.recording();

        Handler.Result result = Handler.processRecords(
            List.of(sqsMessageWithBody(READING), sqsMessageWithBody(MALFORMED), sqsMessageWithBody(READING)),
            fake, "test-table");

        assertThat(result.processed()).isEqualTo(2);
        assertThat(result.failures()).hasSize(1);
        assertThat(result.hasFailures()).isTrue();
        assertThat(fake.puts()).hasSize(2);
    }
}
