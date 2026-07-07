package com.fec.industrial.fog;

import java.util.List;

public class Aggregation {

    public record Summary(String sensorType, String siteId, String unit, String windowStart, String windowEnd,
                           int count, double min, double max, double avg, double latest) {}

    public static Summary rollUp(String sensorType, String siteId, String unit, List<Reading> readings,
                                  String windowStart, String windowEnd) {
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        double sum = 0;
        for (Reading r : readings) {
            min = Math.min(min, r.value());
            max = Math.max(max, r.value());
            sum += r.value();
        }
        double avg = Math.round((sum / readings.size()) * 1000.0) / 1000.0;
        // Readings are appended to the buffer in arrival order and never
        // reordered before rollUp() runs, so the last list element is the
        // most recent sample -- this is what the dashboard gauge shows as
        // "current value" separately from the window's min/max/avg.
        double latest = readings.get(readings.size() - 1).value();
        return new Summary(sensorType, siteId, unit, windowStart, windowEnd, readings.size(), min, max, avg, latest);
    }
}
