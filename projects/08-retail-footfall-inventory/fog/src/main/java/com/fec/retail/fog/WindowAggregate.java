package com.fec.retail.fog;

import java.util.List;

/** Aggregate stats over one flush cycle per (sensor_type, site_id); avg rounded to 3 dp, latest is last in arrival order. */
public record WindowAggregate(String sensorType, String siteId, String unit, String windowStart, String windowEnd,
                               int count, double min, double max, double avg, double latest) {

    static WindowAggregate of(String sensorType, String siteId, String unit,
                               List<Double> values, String windowStart, String windowEnd) {
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        double sum = 0;
        for (double v : values) {
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
        }
        double avg = Math.round((sum / values.size()) * 1000.0) / 1000.0;
        double latest = values.get(values.size() - 1);
        return new WindowAggregate(sensorType, siteId, unit, windowStart, windowEnd, values.size(), min, max, avg, latest);
    }
}
