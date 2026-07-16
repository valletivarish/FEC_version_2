package com.fec.smartcity.dashboard;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import software.amazon.awssdk.services.lambda.model.State;

import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class PipelineHealthTest {

    static Stream<Object[]> queueReachabilityCases() {
        return Stream.of(
            new Object[]{FakeSqsClient.reachable(Map.of("QueueArn", "arn:aws:sqs:eu-west-1:000000000000:fsc-metrics-agg")), true},
            new Object[]{FakeSqsClient.unreachable(), false}
        );
    }

    @ParameterizedTest(name = "queueReachable is {1} when sqs client responds accordingly")
    @MethodSource("queueReachabilityCases")
    void queueReachableReflectsClientAvailability(FakeSqsClient sqs, boolean expected) {
        assertThat(PipelineHealth.queueReachable(sqs, "fsc-metrics-agg")).isEqualTo(expected);
    }

    @Test
    void queueStatusCarriesDetailAlongsideUpFlag() {
        var up = PipelineHealth.queueStatus(
            FakeSqsClient.reachable(Map.of("QueueArn", "arn:aws:sqs:eu-west-1:000000000000:fsc-metrics-agg")),
            "fsc-metrics-agg");
        assertThat(up.up()).isTrue();
        assertThat(up.detail()).isNotBlank();

        var down = PipelineHealth.queueStatus(FakeSqsClient.unreachable(), "fsc-metrics-agg");
        assertThat(down.up()).isFalse();
        assertThat(down.detail()).isNotBlank();
    }

    static Stream<Object[]> lambdaActivityCases() {
        return Stream.of(
            new Object[]{FakeLambdaClient.inState(State.ACTIVE), true},
            new Object[]{FakeLambdaClient.inState(State.PENDING), false},
            new Object[]{FakeLambdaClient.notDeployed(), false}
        );
    }

    @ParameterizedTest(name = "lambdaActive is {1} for {0}")
    @MethodSource("lambdaActivityCases")
    void lambdaActiveReflectsFunctionState(FakeLambdaClient lambda, boolean expected) {
        assertThat(PipelineHealth.lambdaActive(lambda, "fsc-processor")).isEqualTo(expected);
    }

    @Test
    void lambdaStatusReportsFunctionStateAsDetail() {
        var pending = PipelineHealth.lambdaStatus(FakeLambdaClient.inState(State.PENDING), "fsc-processor");
        assertThat(pending.up()).isFalse();
        assertThat(pending.detail()).contains("Pending");

        var active = PipelineHealth.lambdaStatus(FakeLambdaClient.inState(State.ACTIVE), "fsc-processor");
        assertThat(active.up()).isTrue();
    }

    @Test
    void queueDepthReportsWaitingAndInFlightCounts() {
        var sqs = FakeSqsClient.reachable(Map.of(
            "ApproximateNumberOfMessages", "5",
            "ApproximateNumberOfMessagesNotVisible", "2"
        ));
        var depth = PipelineHealth.queueDepth(sqs, "fsc-metrics-agg").orElseThrow();
        assertThat(depth).containsEntry("waiting", 5).containsEntry("in_flight", 2);
    }

    @Test
    void queueDepthIsEmptyWhenQueueUnreachable() {
        var sqs = FakeSqsClient.unreachable();
        assertThat(PipelineHealth.queueDepth(sqs, "fsc-metrics-agg")).isEmpty();
    }

    @Test
    void itemCountDelegatesToScanResult() {
        var dynamo = FakeDynamoDbClient.withScanCount(77);
        assertThat(PipelineHealth.itemCount(dynamo, "fsc-readings")).isEqualTo(77);
    }

    @Test
    void itemCountSumsAcrossPaginatedScanPages() {
        var dynamo = FakeDynamoDbClient.withScanPages(400, 400, 137);
        assertThat(PipelineHealth.itemCount(dynamo, "fsc-readings")).isEqualTo(937);
    }
}
