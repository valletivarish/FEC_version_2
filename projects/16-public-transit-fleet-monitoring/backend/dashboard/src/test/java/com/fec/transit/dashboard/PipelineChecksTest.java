package com.fec.transit.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PipelineChecksTest {

    @Test
    void queueReachableIsTrueWhenQueueExists() {
        FakeSqsClient sqs = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "0",
            "ApproximateNumberOfMessagesNotVisible", "0"));
        assertTrue(new PipelineChecks().dispatchQueueReachable(sqs, "ptf-depot-agg"));
    }

    @Test
    void queueReachableIsFalseWhenQueueMissing() {
        FakeSqsClient sqs = new FakeSqsClient(false, Map.of());
        assertFalse(new PipelineChecks().dispatchQueueReachable(sqs, "ptf-depot-agg"));
    }

    @Test
    void lambdaDeployedIsTrueOnlyWhenStateIsActive() {
        FakeLambdaClient active = new FakeLambdaClient(true, State.ACTIVE);
        FakeLambdaClient pending = new FakeLambdaClient(true, State.PENDING);
        assertTrue(new PipelineChecks().processorActive(active, "ptf-processor"));
        assertFalse(new PipelineChecks().processorActive(pending, "ptf-processor"));
    }

    @Test
    void lambdaDeployedIsFalseWhenFunctionMissing() {
        FakeLambdaClient missing = new FakeLambdaClient(false, State.ACTIVE);
        assertFalse(new PipelineChecks().processorActive(missing, "ptf-processor"));
    }

    @Test
    void queueDepthParsesWaitingAndInFlightCounts() {
        FakeSqsClient sqs = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "7",
            "ApproximateNumberOfMessagesNotVisible", "2"));
        Map<String, Object> backlog = new PipelineChecks().dispatchQueueBacklog(sqs, "ptf-depot-agg");
        assertEquals(7, backlog.get("waiting"));
        assertEquals(2, backlog.get("in_flight"));
    }

    @Test
    void queueDepthReturnsNullWhenQueueUnreachable() {
        FakeSqsClient sqs = new FakeSqsClient(false, Map.of());
        assertNull(new PipelineChecks().dispatchQueueBacklog(sqs, "ptf-depot-agg"));
    }

    @Test
    void itemCountReturnsTheScanCount() {
        FakeDynamoDbClient dynamo = new FakeDynamoDbClient(Map.of(), 42);
        assertEquals(42, new PipelineChecks().storedWindowCount(dynamo, "ptf-readings"));
    }

    @Test
    void itemCountSumsEveryPageInsteadOfOnlyTheFirst() {
        FakeDynamoDbClient dynamo = new FakeDynamoDbClient(Map.of(), List.of(400, 400, 137));
        assertEquals(937, new PipelineChecks().storedWindowCount(dynamo, "ptf-readings"));
    }
}
