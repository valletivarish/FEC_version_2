package com.fec.transit.fog;

import java.util.List;

/** Aggregate statistics computed over one flush window's buffered readings for one depot/sensor pair. */
public record WindowAggregate(String sensorType, String siteId, String unit, String windowStart, String windowEnd,
                               int count, double min, double max, double avg, double latest) {

    public static WindowAggregate of(String sensorType, String siteId, String unit, List<Double> values,
                                      String windowStart, String windowEnd) {
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        double sum = 0;
        for (double value : values) {
            min = Math.min(min, value);
            max = Math.max(max, value);
            sum += value;
        }
        double avg = Math.round((sum / values.size()) * 1000.0) / 1000.0;
        // Values stay in arrival order, so the last element is the most recent reading, reported as "latest" (last-in-order, not max-timestamp).
        double latest = values.get(values.size() - 1);
        return new WindowAggregate(sensorType, siteId, unit, windowStart, windowEnd, values.size(), min, max, avg, latest);
    }
}
