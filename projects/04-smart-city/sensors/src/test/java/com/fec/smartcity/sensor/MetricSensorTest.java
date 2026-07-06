package com.fec.smartcity.sensor;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.random.RandomGenerator;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class MetricSensorTest {

    @Nested
    class WhenConfiningToBounds {

        record ConfineCase(double lo, double hi, double input, double expected) {}

        static Stream<ConfineCase> cases() {
            return Stream.of(
                new ConfineCase(0, 10, 50, 10),
                new ConfineCase(0, 10, -5, 0),
                new ConfineCase(0, 10, 5, 5)
            );
        }

        @ParameterizedTest
        @MethodSource("cases")
        void clampsInputIntoRange(ConfineCase testCase) {
            MetricSensor.Profile profile = new MetricSensor.Profile("u", testCase.lo(), testCase.hi(), 5, 1.0);
            assertThat(profile.confine(testCase.input())).isEqualTo(testCase.expected());
        }
    }

    @Nested
    class WhenSteppingProfileForward {

        @Test
        void givenManySteps_thenValueStaysWithinBounds() {
            MetricSensor.Profile profile = MetricSensor.METRIC_PROFILES.get("vehicle_count");
            RandomGenerator rng = ThreadLocalRandom.current();
            double value = profile.start();
            for (int i = 0; i < 500; i++) {
                value = profile.nextFrom(value, rng);
                assertThat(value).isBetween(profile.lo(), profile.hi());
            }
        }

        @Test
        void givenOneStep_thenMovementIsBoundedByStepSize() {
            MetricSensor.Profile profile = new MetricSensor.Profile("u", 0, 100, 50, 2.0);
            RandomGenerator rng = ThreadLocalRandom.current();
            double moved = profile.nextFrom(50, rng);
            assertThat(Math.abs(moved - 50)).isLessThanOrEqualTo(profile.step());
        }
    }

    @Test
    void metricProfileCatalogCoversAllFiveSensorTypes() {
        assertThat(MetricSensor.METRIC_PROFILES.keySet())
            .isEqualTo(Set.of("vehicle_count", "air_quality_pm25", "noise_level", "parking_occupancy", "ambient_light"));
    }
}
