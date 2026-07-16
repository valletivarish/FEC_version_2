package com.fec.industrial.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class HealthChecksTest {

    @Test
    void queueReachableTrueWhenQueueExists() {
        var sqs = new FakeSqsClient(true, Map.of("QueueArn", "arn:aws:sqs:eu-west-1:000000000000:fei-sensor-agg"));
        assertTrue(HealthChecks.queueReachable(sqs, "fei-sensor-agg"));
    }

    @Test
    void queueReachableFalseWhenQueueMissing() {
        var sqs = new FakeSqsClient(false, Map.of());
        assertFalse(HealthChecks.queueReachable(sqs, "fei-sensor-agg"));
    }

    @Test
    void lambdaActiveTrueWhenStateActive() {
        var lambda = new FakeLambdaClient(true, State.ACTIVE);
        assertTrue(HealthChecks.lambdaActive(lambda, "fei-processor"));
    }

    @Test
    void lambdaActiveFalseWhenPending() {
        var lambda = new FakeLambdaClient(true, State.PENDING);
        assertFalse(HealthChecks.lambdaActive(lambda, "fei-processor"));
    }

    @Test
    void lambdaActiveFalseWhenFunctionMissing() {
        var lambda = new FakeLambdaClient(false, State.ACTIVE);
        assertFalse(HealthChecks.lambdaActive(lambda, "fei-processor"));
    }

    @Test
    void queueDepthReportsWaitingAndInFlight() {
        var sqs = new FakeSqsClient(true, Map.of(
            "ApproximateNumberOfMessages", "3",
            "ApproximateNumberOfMessagesNotVisible", "1"
        ));
        var depth = HealthChecks.queueDepth(sqs, "fei-sensor-agg");
        assertEquals(3, depth.get("waiting"));
        assertEquals(1, depth.get("in_flight"));
    }

    @Test
    void queueDepthNullWhenUnreachable() {
        var sqs = new FakeSqsClient(false, Map.of());
        assertNull(HealthChecks.queueDepth(sqs, "fei-sensor-agg"));
    }

    @Test
    void scanCountReturnsFakeCount() {
        var dynamo = new FakeDynamoDbClient(Map.of(), 42);
        assertEquals(42, HealthChecks.scanCount(dynamo, "fei-readings"));
    }

    @Test
    void scanCountFollowsPaginationInsteadOfStoppingAtTheFirstPage() {
        AttributeValue key = AttributeValue.builder().s("power_draw").build();
        List<ScanResponse> pages = List.of(
            ScanResponse.builder().count(700).lastEvaluatedKey(Map.of("sensor_type", key)).build(),
            ScanResponse.builder().count(340).lastEvaluatedKey(Map.of("sensor_type", key)).build(),
            ScanResponse.builder().count(65).build());
        var dynamo = new FakeDynamoDbClient(pages);
        assertEquals(1105, HealthChecks.scanCount(dynamo, "fei-readings"),
            "every page must be summed, not just the first page's 700");
    }
}
