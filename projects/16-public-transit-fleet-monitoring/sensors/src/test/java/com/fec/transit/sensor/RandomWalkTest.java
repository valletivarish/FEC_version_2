package com.fec.transit.sensor;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RandomWalkTest {

    @RepeatedTest(50)
    void advanceStaysWithinBounds() {
        RandomWalk walk = new RandomWalk(60, 120, 3.0);
        double value = 85.0;
        for (int i = 0; i < 200; i++) {
            value = walk.advance(value);
            assertTrue(value >= 60 && value <= 120, "value " + value + " left [60,120]");
        }
    }

    @Test
    void advanceClampsAtLowerBound() {
        RandomWalk walk = new RandomWalk(0, 100, 5.0);
        double value = walk.advance(0.0);
        assertTrue(value >= 0, "value should never go below lo");
    }

    @Test
    void advanceClampsAtUpperBound() {
        RandomWalk walk = new RandomWalk(0, 80, 10.0);
        double value = walk.advance(80.0);
        assertTrue(value <= 80, "value should never exceed hi");
    }

    @Test
    void advanceRoundsToTwoDecimals() {
        RandomWalk walk = new RandomWalk(0, 100, 5.0);
        double value = walk.advance(50.0);
        double scaled = value * 100.0;
        assertEquals(Math.round(scaled), scaled, 1e-9, "value should be rounded to 2dp");
    }
}
