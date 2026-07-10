package com.fec.port.dashboard;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Computes the primary operational-status line for one berth from its
 * latest window per sensor type -- e.g. "Crane: Nominal | Wind: Safe |
 * Reefer: Nominal | Occupancy: 45%". Distinct in KIND from 19's SAFE/
 * CAUTION/DANGER status TILE (ShaftRepository.classify() collapses a whole
 * shaft down to one of three fixed strings, rendered as a single
 * colour-filled div): this returns FOUR independently-labelled segments,
 * each carrying its own active/inactive flag, meant to be rendered as plain
 * inline text -- colour applied only to the flagged word itself, never a
 * tile background. Each segment reads one real, currently-fired alert key
 * (or its absence) off the berth's own latest windows; nothing here
 * recomputes threshold logic -- that already happened in the fog's
 * BerthRules.assess().
 */
public final class StatusLine {

    public record Segment(String label, String value, boolean active) {}

    private StatusLine() {
    }

    public static List<Segment> build(Map<String, Object> metrics) {
        List<Segment> segments = new ArrayList<>();
        segments.add(craneSegment(metrics));
        segments.add(windSegment(metrics));
        segments.add(reeferSegment(metrics));
        segments.add(occupancySegment(metrics));
        return segments;
    }

    @SuppressWarnings("unchecked")
    private static boolean hasAlert(Map<String, Object> metrics, String sensorType, String alertKey) {
        Object entry = metrics.get(sensorType);
        if (!(entry instanceof Map)) return false;
        Object alerts = ((Map<String, Object>) entry).get("alerts");
        return alerts instanceof List<?> list && list.contains(alertKey);
    }

    @SuppressWarnings("unchecked")
    private static Object latestOf(Map<String, Object> metrics, String sensorType) {
        Object entry = metrics.get(sensorType);
        if (!(entry instanceof Map)) return null;
        return ((Map<String, Object>) entry).get("latest");
    }

    private static Segment craneSegment(Map<String, Object> metrics) {
        boolean active = hasAlert(metrics, "crane_load_kg", "crane_overload_risk");
        return new Segment("Crane", active ? "Overload Risk" : "Nominal", active);
    }

    private static Segment windSegment(Map<String, Object> metrics) {
        boolean active = hasAlert(metrics, "wind_speed_knots", "high_wind_crane_halt");
        return new Segment("Wind", active ? "Crane Halt" : "Safe", active);
    }

    private static Segment reeferSegment(Map<String, Object> metrics) {
        boolean active = hasAlert(metrics, "reefer_temp_c", "reefer_temp_breach");
        return new Segment("Reefer", active ? "Temp Breach" : "Nominal", active);
    }

    private static Segment occupancySegment(Map<String, Object> metrics) {
        boolean active = hasAlert(metrics, "berth_occupancy_pct", "berth_congestion_warning");
        Object latest = latestOf(metrics, "berth_occupancy_pct");
        String pct = latest instanceof Number n ? String.valueOf(Math.round(n.doubleValue())) : "--";
        String value = active ? pct + "% (Congested)" : pct + "%";
        return new Segment("Occupancy", value, active);
    }
}
