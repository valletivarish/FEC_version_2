package com.fec.retail.sensor;

import java.util.concurrent.ThreadLocalRandom;

/** Bounded random walk per sensor profile: nudge by +/-step, clamp to [lo, hi], round to 2 dp. */
record RandomWalk(double lo, double hi, double step) {

    double advance(double current) {
        double next = current + ThreadLocalRandom.current().nextDouble(-step, step);
        double bounded = Math.max(lo, Math.min(hi, next));
        return Math.round(bounded * 100.0) / 100.0;
    }
}
