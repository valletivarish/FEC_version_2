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
        Aggregation.Summary s = Aggregation.condenseWindow("motor_temperature", "line-1", "C", READINGS, "start", "end");
        assertEquals(3, s.count());
        assertEquals(10.0, s.min());
        assertEquals(30.0, s.max());
        assertEquals(20.0, s.avg());
        assertEquals(30.0, s.latest());
    }

    @Test
    void rollUpCarriesMetadata() {
        Aggregation.Summary s = Aggregation.condenseWindow("vibration", "line-7", "mm/s", READINGS, "s", "e");
        assertEquals("vibration", s.sensorType());
        assertEquals("line-7", s.siteId());
        assertEquals("mm/s", s.unit());
        assertEquals("s", s.windowStart());
        assertEquals("e", s.windowEnd());
    }

    @Test
    void latestIsLastReading() {
        List<Reading> readings = List.of(new Reading("t0", 5.0), new Reading("t1", 7.5));
        assertEquals(7.5, Aggregation.condenseWindow("power_draw", "l", "kW", readings, "s", "e").latest());
    }

    @Test
    void singleReadingWindowCollapsesToThatValue() {
        Aggregation.Summary s = Aggregation.condenseWindow("bearing_acoustic", "line-1", "dB",
            List.of(new Reading("t0", 72.0)), "s", "e");
        assertEquals(1, s.count());
        assertEquals(72.0, s.min());
        assertEquals(72.0, s.max());
        assertEquals(72.0, s.avg());
        assertEquals(72.0, s.latest());
    }

    @Test
    void averageIsRoundedToThreeDecimalPlaces() {
        // 1 + 2 + 2 = 5, /3 = 1.6666..., rounded to 1.667
        List<Reading> readings = List.of(new Reading("t0", 1.0), new Reading("t1", 2.0), new Reading("t2", 2.0));
        assertEquals(1.667, Aggregation.condenseWindow("vibration", "l", "mm/s", readings, "s", "e").avg());
    }

    @Test
    void minAndMaxTrackExtremesRegardlessOfArrivalOrder() {
        List<Reading> readings = List.of(new Reading("t0", 30.0), new Reading("t1", 10.0), new Reading("t2", 20.0));
        Aggregation.Summary s = Aggregation.condenseWindow("motor_temperature", "l", "C", readings, "s", "e");
        assertEquals(10.0, s.min());
        assertEquals(30.0, s.max());
        assertEquals(20.0, s.latest(), "latest follows arrival order, not magnitude");
    }
}
