package com.fec.transit.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WindowAggregateTest {

    @Test
    void computesCountMinMaxAvgAndLatest() {
        WindowAggregate agg = WindowAggregate.of("engine_temp_c", "depot-a", "C",
            List.of(88.0, 92.5, 85.0, 95.0), "start", "end");

        assertEquals(4, agg.count());
        assertEquals(85.0, agg.min());
        assertEquals(95.0, agg.max());
        assertEquals(90.125, agg.avg());
        assertEquals(95.0, agg.latest(), "latest must be last-in-order, not max");
    }

    @Test
    void latestIsLastInOrderEvenWhenNotTheMax() {
        WindowAggregate agg = WindowAggregate.of("gps_speed_kmh", "depot-b", "km/h",
            List.of(40.0, 55.0, 30.0), "start", "end");
        assertEquals(30.0, agg.latest());
        assertEquals(55.0, agg.max());
    }

    @Test
    void avgIsRoundedToThreeDecimals() {
        WindowAggregate agg = WindowAggregate.of("fuel_level_pct", "depot-a", "%",
            List.of(10.1, 10.2, 10.1), "start", "end");
        assertEquals(10.133, agg.avg());
    }

    @Test
    void singleReadingWindowHasEqualMinMaxAvgLatest() {
        WindowAggregate agg = WindowAggregate.of("brake_pad_wear_pct", "depot-a", "%",
            List.of(24.5), "start", "end");
        assertEquals(1, agg.count());
        assertEquals(24.5, agg.min());
        assertEquals(24.5, agg.max());
        assertEquals(24.5, agg.avg());
        assertEquals(24.5, agg.latest());
    }
}
