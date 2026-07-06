package com.fec.industrial.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AggregationTest {

    static final List<Reading> READINGS = List.of(
        new Reading("t0", 10.0),
        new Reading("t1", 20.0),
        new Reading("t2", 30.0)
    );

    @Test
    void rollUpBasicStats() {
        Aggregation.Summary s = Aggregation.rollUp("motor_temperature", "line-1", "C", READINGS, "start", "end");
        assertEquals(3, s.count());
        assertEquals(10.0, s.min());
        assertEquals(30.0, s.max());
        assertEquals(20.0, s.avg());
        assertEquals(30.0, s.latest());
    }

    @Test
    void rollUpCarriesMetadata() {
        Aggregation.Summary s = Aggregation.rollUp("vibration", "line-7", "mm/s", READINGS, "s", "e");
        assertEquals("vibration", s.sensorType());
        assertEquals("line-7", s.siteId());
        assertEquals("mm/s", s.unit());
        assertEquals("s", s.windowStart());
        assertEquals("e", s.windowEnd());
    }

    @Test
    void latestIsLastReading() {
        List<Reading> readings = List.of(new Reading("t0", 5.0), new Reading("t1", 7.5));
        assertEquals(7.5, Aggregation.rollUp("power_draw", "l", "kW", readings, "s", "e").latest());
    }
}
