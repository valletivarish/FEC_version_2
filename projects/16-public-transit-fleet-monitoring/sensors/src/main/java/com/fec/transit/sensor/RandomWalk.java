package com.fec.transit.sensor;

import java.util.concurrent.ThreadLocalRandom;

/** Bounded random walk for a bus telemetry profile: nudges by up to +/-step, clamps to [lo, hi], rounds to 2dp. */
record RandomWalk(double lo, double hi, double step) {

    double nextReading(double current) {
        double next = current + ThreadLocalRandom.current().nextDouble(-step, step);
        double bounded = Math.max(lo, Math.min(hi, next));
        return Math.round(bounded * 100.0) / 100.0;
    }
}
