package com.fec.warehouse.dashboard;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PipelineChecksTest {

    @Test
    void queueReachableTrueWhenQueueExists() {
        RelayQueueStub stub = new RelayQueueStub(true, Map.of("QueueArn", "arn:aws:sqs:x"));
        assertTrue(new PipelineChecks().queueReachable(stub, "wrf-fleet-agg"));
    }

    @Test
    void queueReachableFalseWhenQueueMissing() {
        RelayQueueStub stub = new RelayQueueStub(false, Map.of());
        assertFalse(new PipelineChecks().queueReachable(stub, "wrf-fleet-agg"));
    }

    @Test
    void lambdaDeployedTrueWhenActive() {
        ProcessorStatusStub stub = new ProcessorStatusStub(true, State.ACTIVE);
        assertTrue(new PipelineChecks().lambdaDeployed(stub, "wrf-processor"));
    }

    @Test
    void lambdaDeployedFalseWhenPending() {
        ProcessorStatusStub stub = new ProcessorStatusStub(true, State.PENDING);
        assertFalse(new PipelineChecks().lambdaDeployed(stub, "wrf-processor"));
    }

    @Test
    void lambdaDeployedFalseWhenNotFound() {
        ProcessorStatusStub stub = new ProcessorStatusStub(false, State.ACTIVE);
        assertFalse(new PipelineChecks().lambdaDeployed(stub, "wrf-processor"));
    }

    @Test
    void queueDepthParsesAttributes() {
        RelayQueueStub stub = new RelayQueueStub(true, Map.of(
            "ApproximateNumberOfMessages", "4",
            "ApproximateNumberOfMessagesNotVisible", "1"));
        Map<String, Object> depth = new PipelineChecks().queueDepth(stub, "wrf-fleet-agg");
        assertEquals(4, depth.get("waiting"));
        assertEquals(1, depth.get("in_flight"));
    }

    @Test
    void queueDepthNullWhenUnreachable() {
        RelayQueueStub stub = new RelayQueueStub(false, Map.of());
        assertNull(new PipelineChecks().queueDepth(stub, "wrf-fleet-agg"));
    }

    @Test
    void itemCountReturnsScanCount() {
        FleetReadingsTable table = new FleetReadingsTable(Map.of(), 42);
        assertEquals(42, new PipelineChecks().itemCount(table, "wrf-readings"));
    }

    @Test
    void itemCountSumsEveryScanPageInsteadOfStoppingAtTheFirst() {
        List<ScanResponse> pages = List.of(
            ScanResponse.builder().count(410).lastEvaluatedKey(Map.of("sensor_type", software.amazon.awssdk.services.dynamodb.model.AttributeValue.fromS("motor_temp_c"))).build(),
            ScanResponse.builder().count(233).lastEvaluatedKey(Map.of("sensor_type", software.amazon.awssdk.services.dynamodb.model.AttributeValue.fromS("battery_level_pct"))).build(),
            ScanResponse.builder().count(97).build());
        FleetReadingsTable table = new FleetReadingsTable(pages);
        assertEquals(740, new PipelineChecks().itemCount(table, "wrf-readings"));
    }
}
