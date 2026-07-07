package com.fec.retail.sensor;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RandomWalkTest {

    @RepeatedTest(50)
    void advanceStaysWithinBounds() {
        RandomWalk walk = new RandomWalk(0, 600, 25.0);
        double value = walk.advance(80);
        assertTrue(value >= 0 && value <= 600);
    }

    @Test
    void advanceClampsAtLowerBound() {
        RandomWalk walk = new RandomWalk(-2, 12, 0.6);
        for (int i = 0; i < 200; i++) {
            double value = walk.advance(-2);
            assertTrue(value >= -2);
        }
    }

    @Test
    void advanceClampsAtUpperBound() {
        RandomWalk walk = new RandomWalk(0, 100, 5.0);
        for (int i = 0; i < 200; i++) {
            double value = walk.advance(100);
            assertTrue(value <= 100);
        }
    }

    @Test
    void advanceRoundsToTwoDecimals() {
        RandomWalk walk = new RandomWalk(0, 25, 2.0);
        double value = walk.advance(3);
        double scaled = value * 100.0;
        assertEquals(Math.round(scaled), scaled, 1e-9);
    }
}
