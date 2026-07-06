package com.fec.smartcity.fog;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class IncidentRulesTest {

    static WindowSummary.Digest digestWithAvg(double avg) {
        return new WindowSummary.Digest("t", "s", "u", "ws", "we", 1, avg, avg, avg, avg);
    }

    record MetricCase(String metric, double avg, List<String> expectedAlerts) {}

    static Stream<MetricCase> metricCases() {
        return Stream.of(
            new MetricCase("vehicle_count", 220, List.of("congestion_risk")),
            new MetricCase("vehicle_count", 90, List.of()),
            new MetricCase("air_quality_pm25", 55, List.of("air_quality_alert")),
            new MetricCase("noise_level", 82, List.of("noise_violation")),
            new MetricCase("parking_occupancy", 98, List.of("parking_full")),
            new MetricCase("ambient_light", 2, List.of("low_visibility_alert")),
            new MetricCase("humidity", 999, List.of())
        );
    }

    @ParameterizedTest
    @MethodSource("metricCases")
    void givenMetricAndAverage_thenAssessReturnsExpectedAlerts(MetricCase testCase) {
        List<String> alerts = IncidentRules.assess(testCase.metric(), digestWithAvg(testCase.avg()));

        assertThat(alerts).isEqualTo(testCase.expectedAlerts());
    }

    @Nested
    class WhenReadingRuleCatalog {

        @Test
        void thenVehicleCountRuleExposesDeclarativeMetadata() {
            IncidentRules.RuleDescription rule = IncidentRules.RULE_CATALOG.get("vehicle_count").get(0);

            assertThat(rule.field()).isEqualTo("avg");
            assertThat(rule.op()).isEqualTo(">");
            assertThat(rule.limit()).isEqualTo(180.0);
            assertThat(rule.key()).isEqualTo("congestion_risk");
        }
    }
}
