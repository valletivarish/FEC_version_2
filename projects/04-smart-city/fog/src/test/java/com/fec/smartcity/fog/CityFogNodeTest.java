package com.fec.smartcity.fog;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CityFogNodeTest {

    @Nested
    class WhenIngestingReadings {

        @Test
        void givenTwoValues_thenAccumulatorCountsBoth() {
            CityFogNode node = new CityFogNode();
            node.ingest("vehicle_count", "zone-1", "veh/min", List.of(200.0, 220.0));

            assertThat(node.bufferedReadings().get(new CityFogNode.ZoneKey("vehicle_count", "zone-1")).count())
                .isEqualTo(2);
        }
    }

    @Nested
    class WhenFlushingTheWindow {

        @Test
        void givenBufferedReadings_thenDigestIsAggregatedAndAssessed() {
            CityFogNode node = new CityFogNode();
            node.ingest("vehicle_count", "zone-1", "veh/min", List.of(200.0, 240.0));

            List<WindowSummary.Digest> digests = node.flushWindow();
            assertThat(digests).hasSize(1);
            WindowSummary.Digest digest = digests.get(0);
            assertThat(digest.avg()).isEqualTo(220.0);
            assertThat(IncidentRules.assess("vehicle_count", digest)).containsExactly("congestion_risk");
        }

        @Test
        void givenAlreadyFlushed_thenSubsequentFlushIsEmpty() {
            CityFogNode node = new CityFogNode();
            node.ingest("parking_occupancy", "zone-1", "%", List.of(40.0));
            node.flushWindow();

            assertThat(node.flushWindow()).isEmpty();
        }
    }

    @Nested
    class WhenExposingThresholds {

        @Test
        void thenJsonReflectsConfiguredRules() {
            CityFogNode node = new CityFogNode();
            String json = node.thresholdsJson();

            assertThat(json).contains("congestion_risk", "\"limit\":180.0");
        }
    }
}
