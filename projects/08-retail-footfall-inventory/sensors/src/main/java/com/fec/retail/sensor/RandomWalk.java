package com.fec.retail.sensor;

import java.util.concurrent.ThreadLocalRandom;

/**
 * Bounded random walk shared by every sensor profile: each step nudges the
 * current value by up to +/-step, clamps to [lo, hi], and rounds to 2 dp so
 * readings look like plausible instrument output rather than raw doubles.
 */
record RandomWalk(double lo, double hi, double step) {

    double advance(double current) {
        double next = current + ThreadLocalRandom.current().nextDouble(-step, step);
        double bounded = Math.max(lo, Math.min(hi, next));
        return Math.round(bounded * 100.0) / 100.0;
    }
}
