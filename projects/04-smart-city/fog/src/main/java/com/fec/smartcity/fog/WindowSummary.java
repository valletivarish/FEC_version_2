package com.fec.smartcity.fog;

public class WindowSummary {

    public record Digest(String sensorType, String siteId, String unit, String windowStart, String windowEnd,
                          int count, double min, double max, double avg, double latest) {}

    /**
     * Streaming accumulator: folds each incoming value into running statistics
     * as it arrives, so a window's readings are never materialized as a list.
     * Every method synchronizes on the instance itself, so callers can share
     * one accumulator across threads without holding any external lock.
     */
    public static class WindowAccumulator {
        private long count = 0;
        private double min = Double.POSITIVE_INFINITY;
        private double max = Double.NEGATIVE_INFINITY;
        private double sum = 0.0;
        private double latest = Double.NaN;

        public synchronized void add(double value) {
            count++;
            if (value < min) min = value;
            if (value > max) max = value;
            sum += value;
            latest = value;
        }

        public synchronized long count() {
            return count;
        }

        public synchronized Digest snapshot(String sensorType, String siteId, String unit, String windowStart, String windowEnd) {
            double avg = Math.round((sum / count) * 1000.0) / 1000.0;
            return new Digest(sensorType, siteId, unit, windowStart, windowEnd, (int) count, min, max, avg, latest);
        }
    }
}
