package com.fec.port.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class WindowAggregateTest {

    static final List<Reading> READINGS = List.of(
        new Reading("t0", 10.0),
        new Reading("t1", 20.0),
        new Reading("t2", 30.0)
    );

    @Test
    void ofComputesBasicStats() {
        WindowAggregate w = WindowAggregate.of("crane_load_kg", "berth-a", "kg", READINGS, "start", "end");
        assertEquals(3, w.count());
        assertEquals(10.0, w.min());
        assertEquals(30.0, w.max());
        assertEquals(20.0, w.avg());
        assertEquals(30.0, w.latest());
    }

    @Test
    void ofCarriesMetadataThrough() {
        WindowAggregate w = WindowAggregate.of("wind_speed_knots", "berth-b", "knots", READINGS, "s", "e");
        assertEquals("wind_speed_knots", w.sensorType());
        assertEquals("berth-b", w.siteId());
        assertEquals("knots", w.unit());
        assertEquals("s", w.windowStart());
        assertEquals("e", w.windowEnd());
    }

    @Test
    void latestIsLastReadingNotMaxValue() {
        List<Reading> readings = List.of(new Reading("t0", 99.0), new Reading("t1", 12.0));
        assertEquals(12.0, WindowAggregate.of("berth_occupancy_pct", "b", "%", readings, "s", "e").latest());
    }

    @Test
    void avgIsRoundedToThreeDecimals() {
        List<Reading> readings = List.of(new Reading("t0", 1.0), new Reading("t1", 2.0), new Reading("t2", 2.0));
        WindowAggregate w = WindowAggregate.of("reefer_temp_c", "b", "C", readings, "s", "e");
        assertEquals(1.667, w.avg());
    }
}
