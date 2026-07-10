package com.fec.mining.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WindowAggregateTest {

    static final List<Reading> READINGS = List.of(
        new Reading("t0", 300.0),
        new Reading("t1", 500.0),
        new Reading("t2", 700.0)
    );

    @Test
    void computesCountMinMaxAvgAndLatest() {
        WindowAggregate agg = WindowAggregate.of("methane_ppm", "shaft-a", "ppm", READINGS, "start", "end");
        assertEquals(3, agg.count());
        assertEquals(300.0, agg.min());
        assertEquals(700.0, agg.max());
        assertEquals(500.0, agg.avg());
        assertEquals(700.0, agg.latest());
    }

    @Test
    void latestIsLastInOrderEvenWhenNotTheMax() {
        List<Reading> readings = List.of(new Reading("t0", 40.0), new Reading("t1", 55.0), new Reading("t2", 30.0));
        WindowAggregate agg = WindowAggregate.of("co_ppm", "shaft-b", "ppm", readings, "s", "e");
        assertEquals(30.0, agg.latest());
        assertEquals(55.0, agg.max());
    }

    @Test
    void avgIsRoundedToThreeDecimals() {
        List<Reading> readings = List.of(new Reading("t0", 10.1), new Reading("t1", 10.2), new Reading("t2", 10.1));
        WindowAggregate agg = WindowAggregate.of("ambient_temp_c", "shaft-a", "C", readings, "s", "e");
        assertEquals(10.133, agg.avg());
    }

    @Test
    void carriesMetadataThrough() {
        WindowAggregate agg = WindowAggregate.of("ground_vibration_mms", "shaft-a", "mm/s", READINGS, "start", "end");
        assertEquals("ground_vibration_mms", agg.sensorType());
        assertEquals("shaft-a", agg.siteId());
        assertEquals("mm/s", agg.unit());
        assertEquals("start", agg.windowStart());
        assertEquals("end", agg.windowEnd());
    }

    @Test
    void singleReadingWindowHasEqualMinMaxAvgLatest() {
        WindowAggregate agg = WindowAggregate.of("dust_concentration_mgm3", "shaft-b", "mg/m3",
            List.of(new Reading("t0", 6.4)), "s", "e");
        assertEquals(1, agg.count());
        assertEquals(6.4, agg.min());
        assertEquals(6.4, agg.max());
        assertEquals(6.4, agg.avg());
        assertEquals(6.4, agg.latest());
    }
}
