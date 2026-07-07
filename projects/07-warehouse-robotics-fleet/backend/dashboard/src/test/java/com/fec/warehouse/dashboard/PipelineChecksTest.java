package com.fec.warehouse.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PipelineChecksTest {

    @Test
    void queueReachableTrueWhenQueueExists() {
        FakeSqsClient fake = new FakeSqsClient(true, Map.of("QueueArn", "arn:aws:sqs:x"));
        assertTrue(new PipelineChecks().queueReachable(fake, "wrf-fleet-agg"));
    }

    @Test
    void queueReachableFalseWhenQueueMissing() {
        FakeSqsClient fake = new FakeSqsClient(false, Map.of());
        assertFalse(new PipelineChecks().queueReachable(fake, "wrf-fleet-agg"));
    }

    @Test
    void lambdaDeployedTrueWhenActive() {
        FakeLambdaClient fake = new FakeLambdaClient(true, State.ACTIVE);
        assertTrue(new PipelineChecks().lambdaDeployed(fake, "wrf-processor"));
    }

    @Test
    void lambdaDeployedFalseWhenPending() {
        FakeLambdaClient fake = new FakeLambdaClient(true, State.PENDING);
        assertFalse(new PipelineChecks().lambdaDeployed(fake, "wrf-processor"));
    }

    @Test
    void lambdaDeployedFalseWhenNotFound() {
        FakeLambdaClient fake = new FakeLambdaClient(false, State.ACTIVE);
        assertFalse(new PipelineChecks().lambdaDeployed(fake, "wrf-processor"));
    }

    @Test
    void queueDepthParsesAttributes() {
        FakeSqsClient fake = new FakeSqsClient(true, Map.of(
            "ApproximateNumberOfMessages", "4",
            "ApproximateNumberOfMessagesNotVisible", "1"));
        Map<String, Object> depth = new PipelineChecks().queueDepth(fake, "wrf-fleet-agg");
        assertEquals(4, depth.get("waiting"));
        assertEquals(1, depth.get("in_flight"));
    }

    @Test
    void queueDepthNullWhenUnreachable() {
        FakeSqsClient fake = new FakeSqsClient(false, Map.of());
        assertNull(new PipelineChecks().queueDepth(fake, "wrf-fleet-agg"));
    }

    @Test
    void itemCountReturnsScanCount() {
        FakeDynamoDbClient fake = new FakeDynamoDbClient(Map.of(), 42);
        assertEquals(42, new PipelineChecks().itemCount(fake, "wrf-readings"));
    }
}
