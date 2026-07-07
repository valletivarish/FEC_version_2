package com.fec.retail.processor;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TallyTest {

    @Test
    void combiningTwoCleanTalliesSumsWrittenCounts() {
        Tally combined = Tally.success().combine(Tally.success());
        assertEquals(2, combined.written());
        assertTrue(combined.clean());
    }

    @Test
    void combiningWithAFailureAccumulatesReasons() {
        Tally combined = Tally.success().combine(Tally.failed("boom"));
        assertEquals(1, combined.written());
        assertEquals(List.of("boom"), combined.failures());
        assertFalse(combined.clean());
    }

    @Test
    void reduceOverEmptyListYieldsEmptyTally() {
        Tally result = List.<Tally>of().stream().reduce(Tally.EMPTY, Tally::combine);
        assertEquals(Tally.EMPTY, result);
    }

    @Test
    void reduceFoldsAWholeBatchInOrder() {
        Tally result = List.of(Tally.success(), Tally.failed("x"), Tally.success())
            .stream().reduce(Tally.EMPTY, Tally::combine);
        assertEquals(2, result.written());
        assertEquals(List.of("x"), result.failures());
    }
}
