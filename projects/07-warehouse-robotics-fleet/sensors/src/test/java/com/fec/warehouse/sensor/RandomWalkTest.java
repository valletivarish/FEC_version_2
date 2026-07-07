package com.fec.warehouse.sensor;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RandomWalkTest {

    @RepeatedTest(50)
    void advanceStaysWithinBounds() {
        RandomWalk walk = new RandomWalk(0, 100, 4.0);
        double value = walk.advance(80);
        assertTrue(value >= 0 && value <= 100);
    }

    @Test
    void advanceClampsAtLowerBound() {
        RandomWalk walk = new RandomWalk(0, 15, 0.8);
        for (int i = 0; i < 200; i++) {
            double value = walk.advance(0);
            assertTrue(value >= 0);
        }
    }

    @Test
    void advanceClampsAtUpperBound() {
        RandomWalk walk = new RandomWalk(20, 95, 4.0);
        for (int i = 0; i < 200; i++) {
            double value = walk.advance(95);
            assertTrue(value <= 95);
        }
    }

    @Test
    void advanceRoundsToTwoDecimals() {
        RandomWalk walk = new RandomWalk(0, 200, 15.0);
        double value = walk.advance(40);
        double scaled = value * 100.0;
        assertEquals(Math.round(scaled), scaled, 1e-9);
    }
}
