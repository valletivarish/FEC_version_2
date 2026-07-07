package com.fec.warehouse.fog;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Holds the buffered values for one (sensor_type, site_id) pair behind its
 * own lock, so ingest on one robot never contends with ingest on another --
 * only a bucket's own flush blocks its own writers.
 */
class BufferBucket {

    private final ReentrantLock lock = new ReentrantLock();
    private List<Double> values = new ArrayList<>();
    private volatile String unit = "";

    void add(String withUnit, List<Double> incoming) {
        lock.lock();
        try {
            values.addAll(incoming);
            if (withUnit != null && !withUnit.isEmpty()) unit = withUnit;
        } finally {
            lock.unlock();
        }
    }

    List<Double> drain() {
        lock.lock();
        try {
            if (values.isEmpty()) return List.of();
            List<Double> snapshot = values;
            values = new ArrayList<>();
            return snapshot;
        } finally {
            lock.unlock();
        }
    }

    String unit() {
        return unit;
    }
}
