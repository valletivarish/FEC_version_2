package com.fec.aquaculture.processor;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TallyTest {

    @Test
    void emptyTallyIsClean() {
        assertTrue(Tally.EMPTY.clean());
        assertEquals(0, Tally.EMPTY.written());
    }

    @Test
    void successCombinedWithSuccessAddsWrittenCounts() {
        Tally combined = Tally.success().combine(Tally.success());
        assertEquals(2, combined.written());
        assertTrue(combined.clean());
    }

    @Test
    void successCombinedWithFailureIsNotCleanButKeepsTheWrite() {
        Tally combined = Tally.success().combine(Tally.failed("boom"));
        assertEquals(1, combined.written());
        assertFalse(combined.clean());
        assertEquals(1, combined.failures().size());
    }

    @Test
    void combineMergesFailureListsFromBothSides() {
        Tally combined = Tally.failed("a").combine(Tally.failed("b"));
        assertEquals(2, combined.failures().size());
        assertTrue(combined.failures().contains("a"));
        assertTrue(combined.failures().contains("b"));
    }

    @Test
    void combineIsOrderIndependentForTheWrittenTotal() {
        Tally left = Tally.success().combine(Tally.failed("x"));
        Tally right = Tally.failed("x").combine(Tally.success());
        assertEquals(left.written(), right.written());
        assertEquals(left.failures().size(), right.failures().size());
    }
}
