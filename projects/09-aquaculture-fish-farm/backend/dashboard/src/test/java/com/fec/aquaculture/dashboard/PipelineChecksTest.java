package com.fec.aquaculture.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PipelineChecksTest {

    @Test
    void queueReachableIsTrueWhenQueueExists() {
        FakeSqsClient sqs = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "0",
            "ApproximateNumberOfMessagesNotVisible", "0"));
        assertTrue(new PipelineChecks().queueReachable(sqs, "aff-pond-agg"));
    }

    @Test
    void queueReachableIsFalseWhenQueueMissing() {
        FakeSqsClient sqs = new FakeSqsClient(false, Map.of());
        assertFalse(new PipelineChecks().queueReachable(sqs, "aff-pond-agg"));
    }

    @Test
    void lambdaDeployedIsTrueOnlyWhenStateIsActive() {
        FakeLambdaClient active = new FakeLambdaClient(true, State.ACTIVE);
        FakeLambdaClient pending = new FakeLambdaClient(true, State.PENDING);
        assertTrue(new PipelineChecks().lambdaDeployed(active, "aff-processor"));
        assertFalse(new PipelineChecks().lambdaDeployed(pending, "aff-processor"));
    }

    @Test
    void lambdaDeployedIsFalseWhenFunctionMissing() {
        FakeLambdaClient missing = new FakeLambdaClient(false, State.ACTIVE);
        assertFalse(new PipelineChecks().lambdaDeployed(missing, "aff-processor"));
    }

    @Test
    void queueDepthParsesWaitingAndInFlightCounts() {
        FakeSqsClient sqs = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "7",
            "ApproximateNumberOfMessagesNotVisible", "2"));
        Map<String, Object> depth = new PipelineChecks().queueDepth(sqs, "aff-pond-agg");
        assertEquals(7, depth.get("waiting"));
        assertEquals(2, depth.get("in_flight"));
    }

    @Test
    void queueDepthReturnsNullWhenQueueUnreachable() {
        FakeSqsClient sqs = new FakeSqsClient(false, Map.of());
        assertNull(new PipelineChecks().queueDepth(sqs, "aff-pond-agg"));
    }

    @Test
    void itemCountReturnsTheScanCount() {
        FakeDynamoDbClient dynamo = new FakeDynamoDbClient(Map.of(), 42);
        assertEquals(42, new PipelineChecks().itemCount(dynamo, "aff-readings"));
    }
}
