package com.fec.port.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PipelineStatusTest {

    @Test
    void queueReachableIsTrueWhenQueueExists() {
        FakeSqsClient sqs = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "0",
            "ApproximateNumberOfMessagesNotVisible", "0"));
        assertTrue(new PipelineStatus().queueReachable(sqs, "spc-berth-agg"));
    }

    @Test
    void queueReachableIsFalseWhenQueueMissing() {
        FakeSqsClient sqs = new FakeSqsClient(false, Map.of());
        assertFalse(new PipelineStatus().queueReachable(sqs, "spc-berth-agg"));
    }

    @Test
    void lambdaDeployedIsTrueOnlyWhenStateIsActive() {
        FakeLambdaClient active = new FakeLambdaClient(true, State.ACTIVE);
        FakeLambdaClient pending = new FakeLambdaClient(true, State.PENDING);
        assertTrue(new PipelineStatus().lambdaDeployed(active, "spc-processor"));
        assertFalse(new PipelineStatus().lambdaDeployed(pending, "spc-processor"));
    }

    @Test
    void lambdaDeployedIsFalseWhenFunctionMissing() {
        FakeLambdaClient missing = new FakeLambdaClient(false, State.ACTIVE);
        assertFalse(new PipelineStatus().lambdaDeployed(missing, "spc-processor"));
    }

    @Test
    void queueDepthParsesWaitingAndInFlightCounts() {
        FakeSqsClient sqs = new FakeSqsClient(true, Map.of("ApproximateNumberOfMessages", "7",
            "ApproximateNumberOfMessagesNotVisible", "2"));
        Map<String, Object> depth = new PipelineStatus().queueDepth(sqs, "spc-berth-agg");
        assertEquals(7, depth.get("waiting"));
        assertEquals(2, depth.get("in_flight"));
    }

    @Test
    void queueDepthReturnsNullWhenQueueUnreachable() {
        FakeSqsClient sqs = new FakeSqsClient(false, Map.of());
        assertNull(new PipelineStatus().queueDepth(sqs, "spc-berth-agg"));
    }

    @Test
    void itemCountReturnsTheScanCount() {
        FakeDynamoDbClient dynamo = new FakeDynamoDbClient(Map.of(), 42);
        assertEquals(42, new PipelineStatus().itemCount(dynamo, "spc-readings"));
    }

    @Test
    void itemCountSumsAcrossPaginatedScanPages() {
        FakeDynamoDbClient dynamo = new FakeDynamoDbClient(Map.of(), List.of(500, 500, 137));
        assertEquals(1137, new PipelineStatus().itemCount(dynamo, "spc-readings"));
    }
}
