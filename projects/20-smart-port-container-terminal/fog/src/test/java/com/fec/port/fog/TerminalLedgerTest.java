package com.fec.port.fog;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TerminalLedgerTest {

    @Test
    void ingestGroupsReadingsBySensorTypeAndSite() {
        TerminalLedger ledger = new TerminalLedger();
        ledger.ingest("crane_load_kg", "berth-a", "kg", List.of(new Reading("t0", 15000.0), new Reading("t1", 15400.0)));

        Map<GroupKey, TerminalLedger.WindowBatch> drained = ledger.drainWindow();
        assertEquals(1, drained.size());
        assertTrue(drained.containsKey(new GroupKey("crane_load_kg", "berth-a")));
        assertEquals(2, drained.get(new GroupKey("crane_load_kg", "berth-a")).readings().size());
    }

    @Test
    void differentSitesForTheSameSensorTypeAreSeparateGroups() {
        TerminalLedger ledger = new TerminalLedger();
        ledger.ingest("wind_speed_knots", "berth-a", "knots", List.of(new Reading("t0", 10.0)));
        ledger.ingest("wind_speed_knots", "berth-b", "knots", List.of(new Reading("t0", 12.0)));

        assertEquals(2, ledger.drainWindow().size());
    }

    @Test
    void drainReturnsReadingsInArrivalOrderAndEmptiesTheLedger() {
        TerminalLedger ledger = new TerminalLedger();
        ledger.ingest("reefer_temp_c", "berth-a", "C", List.of(new Reading("t0", -18.0), new Reading("t1", -16.0)));

        var drained = ledger.drainWindow();
        List<Reading> readings = drained.get(new GroupKey("reefer_temp_c", "berth-a")).readings();
        assertEquals(2, readings.size());
        assertEquals(-18.0, readings.get(0).value());
        assertEquals(-16.0, readings.get(1).value());

        assertTrue(ledger.drainWindow().isEmpty());
    }

    @Test
    void drainOnAnEmptyLedgerReturnsEmptyMap() {
        assertTrue(new TerminalLedger().drainWindow().isEmpty());
    }

    @Test
    void readingsIngestedAfterTheDrainBoundaryAreKeptForTheNextWindow() {
        TerminalLedger ledger = new TerminalLedger();
        ledger.ingest("berth_occupancy_pct", "berth-a", "%", List.of(new Reading("t0", 40.0)));

        // drainWindow() snapshots the sequence boundary before the second
        // ingest, so the second reading must survive into the next drain.
        var first = ledger.drainWindow();
        ledger.ingest("berth_occupancy_pct", "berth-a", "%", List.of(new Reading("t1", 55.0)));
        var second = ledger.drainWindow();

        assertEquals(1, first.get(new GroupKey("berth_occupancy_pct", "berth-a")).readings().size());
        assertEquals(1, second.get(new GroupKey("berth_occupancy_pct", "berth-a")).readings().size());
        assertEquals(55.0, second.get(new GroupKey("berth_occupancy_pct", "berth-a")).readings().get(0).value());
    }

    @Test
    void windowBatchCarriesTheMostRecentlySeenUnitForThatGroup() {
        TerminalLedger ledger = new TerminalLedger();
        ledger.ingest("container_stack_height", "berth-b", "count", List.of(new Reading("t0", 4.0)));

        var batch = ledger.drainWindow().get(new GroupKey("container_stack_height", "berth-b"));
        assertEquals("count", batch.unit());
    }
}
