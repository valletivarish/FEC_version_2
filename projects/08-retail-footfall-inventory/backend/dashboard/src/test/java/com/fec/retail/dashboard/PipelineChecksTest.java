package com.fec.retail.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PipelineChecksTest {

    @Test
    void queueReachableTrueWhenQueueExists() {
        var fake = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "0", "ApproximateNumberOfMessagesNotVisible", "0"));
        assertTrue(new PipelineChecks().queueReachable(fake, "rfi-store-agg"));
    }

    @Test
    void queueReachableFalseWhenQueueMissing() {
        var fake = new FakeSqsClient(false, Map.of());
        assertFalse(new PipelineChecks().queueReachable(fake, "rfi-store-agg"));
    }

    @Test
    void lambdaDeployedTrueWhenActive() {
        var fake = new FakeLambdaClient(true, State.ACTIVE);
        assertTrue(new PipelineChecks().lambdaDeployed(fake, "rfi-processor"));
    }

    @Test
    void lambdaDeployedFalseWhenPending() {
        var fake = new FakeLambdaClient(true, State.PENDING);
        assertFalse(new PipelineChecks().lambdaDeployed(fake, "rfi-processor"));
    }

    @Test
    void lambdaDeployedFalseWhenMissing() {
        var fake = new FakeLambdaClient(false, State.ACTIVE);
        assertFalse(new PipelineChecks().lambdaDeployed(fake, "rfi-processor"));
    }

    @Test
    void queueDepthParsesWaitingAndInFlight() {
        var fake = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "4", "ApproximateNumberOfMessagesNotVisible", "2"));
        var depth = new PipelineChecks().queueDepth(fake, "rfi-store-agg");
        assertEquals(4, depth.get("waiting"));
        assertEquals(2, depth.get("in_flight"));
    }

    @Test
    void queueDepthReturnsNullWhenUnreachable() {
        var fake = new FakeSqsClient(false, Map.of());
        assertNull(new PipelineChecks().queueDepth(fake, "rfi-store-agg"));
    }

    @Test
    void itemCountReturnsFakeScanCount() {
        var fake = new FakeDynamoDbClient(Map.of(), 42);
        assertEquals(42, new PipelineChecks().itemCount(fake, "rfi-readings"));
    }
}
