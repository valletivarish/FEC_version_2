package com.fec.smartcity.fog;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class WindowSummaryTest {

    static WindowSummary.WindowAccumulator accumulatorOf(double... values) {
        WindowSummary.WindowAccumulator acc = new WindowSummary.WindowAccumulator();
        for (double v : values) acc.add(v);
        return acc;
    }

    @Nested
    class WhenSnapshottingAWindow {

        @Test
        void thenBasicStatisticsAreComputed() {
            WindowSummary.Digest d = accumulatorOf(40.0, 60.0, 80.0)
                .snapshot("vehicle_count", "zone-1", "veh/min", "start", "end");

            assertThat(d.count()).isEqualTo(3);
            assertThat(d.min()).isEqualTo(40.0);
            assertThat(d.max()).isEqualTo(80.0);
            assertThat(d.avg()).isEqualTo(60.0);
            assertThat(d.latest()).isEqualTo(80.0);
        }

        @Test
        void thenMetadataIsCarriedThrough() {
            WindowSummary.Digest d = accumulatorOf(40.0, 60.0, 80.0)
                .snapshot("noise_level", "zone-9", "dB", "s", "e");

            assertThat(d.sensorType()).isEqualTo("noise_level");
            assertThat(d.siteId()).isEqualTo("zone-9");
            assertThat(d.unit()).isEqualTo("dB");
            assertThat(d.windowStart()).isEqualTo("s");
            assertThat(d.windowEnd()).isEqualTo("e");
        }

        @Test
        void thenLatestReflectsTheLastValueAdded() {
            WindowSummary.Digest d = accumulatorOf(5.0, 7.5).snapshot("ambient_light", "z", "lux", "s", "e");

            assertThat(d.latest()).isEqualTo(7.5);
        }
    }

    @Nested
    class WhenAccumulatingIncrementally {

        @Test
        void thenCountGrowsWithEachAdd() {
            WindowSummary.WindowAccumulator acc = new WindowSummary.WindowAccumulator();
            assertThat(acc.count()).isZero();

            acc.add(10.0);
            assertThat(acc.count()).isEqualTo(1);

            acc.add(20.0);
            assertThat(acc.count()).isEqualTo(2);
        }
    }
}
