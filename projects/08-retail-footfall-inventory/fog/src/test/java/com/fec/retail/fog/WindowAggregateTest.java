package com.fec.retail.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class WindowAggregateTest {

    @Test
    void computesCountMinMaxAvgLatest() {
        WindowAggregate w = WindowAggregate.of("queue_length", "store-1", "people",
            List.of(2.0, 5.0, 8.0), "start", "end");

        assertEquals(3, w.count());
        assertEquals(2.0, w.min());
        assertEquals(8.0, w.max());
        assertEquals(5.0, w.avg());
        assertEquals(8.0, w.latest());
    }

    @Test
    void latestIsLastValueNotMax() {
        WindowAggregate w = WindowAggregate.of("footfall_count", "store-2", "visitors",
            List.of(300.0, 550.0, 400.0), "start", "end");

        assertEquals(400.0, w.latest());
        assertEquals(550.0, w.max());
    }

    @Test
    void singleValueWindow() {
        WindowAggregate w = WindowAggregate.of("energy_draw_kw", "store-1", "kW",
            List.of(22.5), "start", "end");

        assertEquals(1, w.count());
        assertEquals(22.5, w.min());
        assertEquals(22.5, w.max());
        assertEquals(22.5, w.avg());
    }

    @Test
    void avgRoundsToThreeDecimals() {
        WindowAggregate w = WindowAggregate.of("shelf_stock_pct", "store-1", "%",
            List.of(1.0, 2.0, 2.0), "start", "end");

        assertEquals(1.667, w.avg());
    }
}
