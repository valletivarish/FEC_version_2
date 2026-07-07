package com.fec.warehouse.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class WindowAggregateTest {

    @Test
    void computesCountMinMaxAvgLatest() {
        WindowAggregate w = WindowAggregate.of("motor_temp_c", "zone-a", "C",
            List.of(40.0, 50.0, 60.0), "start", "end");

        assertEquals(3, w.count());
        assertEquals(40.0, w.min());
        assertEquals(60.0, w.max());
        assertEquals(50.0, w.avg());
        assertEquals(60.0, w.latest());
    }

    @Test
    void latestIsLastValueNotMax() {
        WindowAggregate w = WindowAggregate.of("battery_level_pct", "zone-b", "%",
            List.of(80.0, 60.0, 70.0), "start", "end");

        assertEquals(70.0, w.latest());
        assertEquals(80.0, w.max());
    }

    @Test
    void singleValueWindow() {
        WindowAggregate w = WindowAggregate.of("payload_kg", "zone-a", "kg",
            List.of(42.5), "start", "end");

        assertEquals(1, w.count());
        assertEquals(42.5, w.min());
        assertEquals(42.5, w.max());
        assertEquals(42.5, w.avg());
    }

    @Test
    void avgRoundsToThreeDecimals() {
        WindowAggregate w = WindowAggregate.of("task_queue_depth", "zone-a", "tasks",
            List.of(1.0, 2.0, 2.0), "start", "end");

        assertEquals(1.667, w.avg());
    }
}
