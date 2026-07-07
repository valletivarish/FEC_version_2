package com.fec.aquaculture.sensor;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RandomWalkTest {

    @RepeatedTest(50)
    void advanceStaysWithinBounds() {
        RandomWalk walk = new RandomWalk(1, 12, 0.6);
        double value = 7.0;
        for (int i = 0; i < 200; i++) {
            value = walk.advance(value);
            assertTrue(value >= 1 && value <= 12, "value " + value + " left [1,12]");
        }
    }

    @Test
    void advanceClampsAtLowerBound() {
        RandomWalk walk = new RandomWalk(0, 2, 0.05);
        double value = walk.advance(0.0);
        assertTrue(value >= 0, "value should never go below lo");
    }

    @Test
    void advanceClampsAtUpperBound() {
        RandomWalk walk = new RandomWalk(0, 500, 40.0);
        double value = walk.advance(500.0);
        assertTrue(value <= 500, "value should never exceed hi");
    }

    @Test
    void advanceRoundsToTwoDecimals() {
        RandomWalk walk = new RandomWalk(0, 100, 5.0);
        double value = walk.advance(50.0);
        double scaled = value * 100.0;
        assertEquals(Math.round(scaled), scaled, 1e-9, "value should be rounded to 2dp");
    }
}
