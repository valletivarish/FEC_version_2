package com.fec.wildlife.fog;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ReservePublisherTest {

    @Test
    void jitteredStaysWithinPlusOrMinusTwentyPercentOfTheBaseDelay() {
        long base = 1000;
        for (int i = 0; i < 200; i++) {
            long jittered = ReservePublisher.jittered(base);
            assertTrue(jittered >= 800 && jittered <= 1200, "jittered delay " + jittered + " left the expected band");
        }
    }

    @Test
    void jitteredScalesWithTheInputDelay() {
        long jittered = ReservePublisher.jittered(5000);
        assertTrue(jittered >= 4000 && jittered <= 6000);
    }
}
