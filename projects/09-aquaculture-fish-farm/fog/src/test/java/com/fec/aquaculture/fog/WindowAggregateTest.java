package com.fec.aquaculture.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WindowAggregateTest {

    @Test
    void computesCountMinMaxAvgAndLatest() {
        WindowAggregate agg = WindowAggregate.of("dissolved_oxygen_mgl", "pond-1", "mg/L",
            List.of(6.0, 7.5, 5.0, 8.0), "start", "end");

        assertEquals(4, agg.count());
        assertEquals(5.0, agg.min());
        assertEquals(8.0, agg.max());
        assertEquals(6.625, agg.avg());
        assertEquals(8.0, agg.latest(), "latest must be last-in-order, not max");
    }

    @Test
    void latestIsLastInOrderEvenWhenNotTheMax() {
        WindowAggregate agg = WindowAggregate.of("ph_level", "pond-2", "pH",
            List.of(9.0, 7.0, 6.5), "start", "end");
        assertEquals(6.5, agg.latest());
        assertEquals(9.0, agg.max());
    }

    @Test
    void avgIsRoundedToThreeDecimals() {
        WindowAggregate agg = WindowAggregate.of("ammonia_ppm", "pond-1", "ppm",
            List.of(0.1, 0.2, 0.1), "start", "end");
        assertEquals(0.133, agg.avg());
    }

    @Test
    void singleReadingWindowHasEqualMinMaxAvgLatest() {
        WindowAggregate agg = WindowAggregate.of("water_temp_c", "pond-1", "C",
            List.of(24.5), "start", "end");
        assertEquals(1, agg.count());
        assertEquals(24.5, agg.min());
        assertEquals(24.5, agg.max());
        assertEquals(24.5, agg.avg());
        assertEquals(24.5, agg.latest());
    }
}
