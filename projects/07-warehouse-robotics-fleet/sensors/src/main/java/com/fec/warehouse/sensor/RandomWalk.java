package com.fec.warehouse.sensor;

import java.util.concurrent.ThreadLocalRandom;

record RandomWalk(double lo, double hi, double step) {

    double advance(double current) {
        double next = current + ThreadLocalRandom.current().nextDouble(-step, step);
        double bounded = Math.max(lo, Math.min(hi, next));
        return Math.round(bounded * 100.0) / 100.0;
    }
}
