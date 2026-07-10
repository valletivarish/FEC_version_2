package com.fec.port.dashboard;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class StatusLineTest {

    static Map<String, Object> metric(double latest, List<String> alerts) {
        return Map.of("latest", latest, "alerts", alerts);
    }

    @Test
    void allNominalWhenNoAlertsAreFiring() {
        Map<String, Object> metrics = Map.of(
            "crane_load_kg", metric(15000, List.of()),
            "wind_speed_knots", metric(12, List.of()),
            "reefer_temp_c", metric(-18, List.of()),
            "berth_occupancy_pct", metric(45, List.of())
        );
        List<StatusLine.Segment> segments = StatusLine.build(metrics);

        assertEquals(4, segments.size());
        assertEquals(new StatusLine.Segment("Crane", "Nominal", false), segments.get(0));
        assertEquals(new StatusLine.Segment("Wind", "Safe", false), segments.get(1));
        assertEquals(new StatusLine.Segment("Reefer", "Nominal", false), segments.get(2));
        assertEquals(new StatusLine.Segment("Occupancy", "45%", false), segments.get(3));
    }

    @Test
    void craneSegmentFlagsOverloadRisk() {
        Map<String, Object> metrics = Map.of("crane_load_kg", metric(33000, List.of("crane_overload_risk")));
        StatusLine.Segment crane = StatusLine.build(metrics).get(0);
        assertEquals("Overload Risk", crane.value());
        assertTrue(crane.active());
    }

    @Test
    void windSegmentFlagsCraneHalt() {
        Map<String, Object> metrics = Map.of("wind_speed_knots", metric(38, List.of("high_wind_crane_halt")));
        StatusLine.Segment wind = StatusLine.build(metrics).get(1);
        assertEquals("Crane Halt", wind.value());
        assertTrue(wind.active());
    }

    @Test
    void reeferSegmentFlagsTempBreach() {
        Map<String, Object> metrics = Map.of("reefer_temp_c", metric(-8, List.of("reefer_temp_breach")));
        StatusLine.Segment reefer = StatusLine.build(metrics).get(2);
        assertEquals("Temp Breach", reefer.value());
        assertTrue(reefer.active());
    }

    @Test
    void occupancySegmentShowsCongestedAnnotationWhenAlertFires() {
        Map<String, Object> metrics = Map.of("berth_occupancy_pct", metric(92, List.of("berth_congestion_warning")));
        StatusLine.Segment occupancy = StatusLine.build(metrics).get(3);
        assertEquals("92% (Congested)", occupancy.value());
        assertTrue(occupancy.active());
    }

    @Test
    void missingMetricsRenderAsDefaultNominalSegments() {
        List<StatusLine.Segment> segments = StatusLine.build(Map.of());
        assertEquals("Nominal", segments.get(0).value());
        assertEquals("--%", segments.get(3).value());
        assertFalse(segments.get(3).active());
    }
}
