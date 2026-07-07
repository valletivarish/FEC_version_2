package com.fec.retail.fog;

import java.util.List;

/**
 * Real aggregate statistics over one flush cycle's worth of readings for a
 * single (sensor_type, site_id) pair -- count/min/max/avg/latest, never a
 * pass-through of raw values. avg is rounded to 3 dp; latest is the
 * last-in-arrival-order reading, not the max-timestamp one (the two only
 * differ if readings ever arrive out of order, which this pipeline does not
 * attempt to correct for).
 */
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
