package com.fec.mining.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PipelineChecksTest {

    @Test
    void queueReachableIsTrueWhenQueueExists() {
        ShaftQueueStub sqs = new ShaftQueueStub(true, Map.of("ApproximateNumberOfMessages", "0",
            "ApproximateNumberOfMessagesNotVisible", "0"));
        assertTrue(new PipelineChecks().queueReachable(sqs, "msm-shaft-agg"));
    }

    @Test
    void queueReachableIsFalseWhenQueueMissing() {
        ShaftQueueStub sqs = new ShaftQueueStub(false, Map.of());
        assertFalse(new PipelineChecks().queueReachable(sqs, "msm-shaft-agg"));
    }

    @Test
    void lambdaDeployedIsTrueOnlyWhenStateIsActive() {
        ProcessorFunctionStub active = new ProcessorFunctionStub(true, State.ACTIVE);
        ProcessorFunctionStub pending = new ProcessorFunctionStub(true, State.PENDING);
        assertTrue(new PipelineChecks().lambdaDeployed(active, "msm-processor"));
        assertFalse(new PipelineChecks().lambdaDeployed(pending, "msm-processor"));
    }

    @Test
    void lambdaDeployedIsFalseWhenFunctionMissing() {
        ProcessorFunctionStub missing = new ProcessorFunctionStub(false, State.ACTIVE);
        assertFalse(new PipelineChecks().lambdaDeployed(missing, "msm-processor"));
    }

    @Test
    void queueDepthParsesWaitingAndInFlightCounts() {
        ShaftQueueStub sqs = new ShaftQueueStub(true, Map.of("ApproximateNumberOfMessages", "7",
            "ApproximateNumberOfMessagesNotVisible", "2"));
        Map<String, Object> depth = new PipelineChecks().queueDepth(sqs, "msm-shaft-agg");
        assertEquals(7, depth.get("waiting"));
        assertEquals(2, depth.get("in_flight"));
    }

    @Test
    void queueDepthReturnsNullWhenQueueUnreachable() {
        ShaftQueueStub sqs = new ShaftQueueStub(false, Map.of());
        assertNull(new PipelineChecks().queueDepth(sqs, "msm-shaft-agg"));
    }

    @Test
    void itemCountReturnsTheScanCount() {
        InMemoryReadingsTable dynamo = new InMemoryReadingsTable(Map.of(), 42);
        assertEquals(42, new PipelineChecks().itemCount(dynamo, "msm-readings"));
    }

    @Test
    void itemCountSumsEveryPageInsteadOfStoppingAtTheFirst() {
        AttributeValue key = AttributeValue.builder().s("shaft-a").build();
        List<ScanResponse> pages = List.of(
            ScanResponse.builder().count(620).lastEvaluatedKey(Map.of("site_id", key)).build(),
            ScanResponse.builder().count(275).lastEvaluatedKey(Map.of("site_id", key)).build(),
            ScanResponse.builder().count(190).lastEvaluatedKey(Map.of("site_id", key)).build(),
            ScanResponse.builder().count(88).build());
        InMemoryReadingsTable dynamo = new InMemoryReadingsTable(pages);
        assertEquals(1173, new PipelineChecks().itemCount(dynamo, "msm-readings"),
            "all four pages must be summed, not just the first page's 620");
    }
}
