package com.fec.port.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TerminalGatewayTest {

    @Test
    void ingestBuffersReadingsIntoTheLedger() {
        TerminalGateway gateway = new TerminalGateway();
        gateway.ingest("crane_load_kg", "berth-a", "kg", List.of(new Reading("t0", 15000.0), new Reading("t1", 15400.0)));

        List<TerminalPublisher.Publication> flushed = gateway.flushWindow();
        assertEquals(1, flushed.size());
        assertEquals(15200.0, flushed.get(0).window().avg());
    }

    @Test
    void flushWindowEvaluatesRealThresholds() {
        TerminalGateway gateway = new TerminalGateway();
        gateway.ingest("wind_speed_knots", "berth-a", "knots", List.of(new Reading("t0", 40.0), new Reading("t1", 38.0)));

        var flushed = gateway.flushWindow();
        assertEquals(List.of("high_wind_crane_halt"), flushed.get(0).alerts());
    }

    @Test
    void flushWindowIsEmptyWhenNothingWasIngested() {
        assertTrue(new TerminalGateway().flushWindow().isEmpty());
    }

    @Test
    void flushWindowDrainsSoASecondImmediateFlushIsEmpty() {
        TerminalGateway gateway = new TerminalGateway();
        gateway.ingest("berth_occupancy_pct", "berth-b", "%", List.of(new Reading("t0", 50.0)));
        gateway.flushWindow();
        assertTrue(gateway.flushWindow().isEmpty());
    }

    @Test
    void thresholdsJsonExposesTheRealRules() {
        TerminalGateway gateway = new TerminalGateway();
        String json = gateway.thresholdsJson();
        assertTrue(json.contains("crane_overload_risk"));
        assertTrue(json.contains("\"limit\":32000.0"));
        assertTrue(json.contains("reefer_temp_breach"));
    }

    @Test
    void thresholdsJsonOmitsSensorTypesWithNoRule() {
        TerminalGateway gateway = new TerminalGateway();
        assertFalse(gateway.thresholdsJson().contains("container_stack_height"));
    }
}
