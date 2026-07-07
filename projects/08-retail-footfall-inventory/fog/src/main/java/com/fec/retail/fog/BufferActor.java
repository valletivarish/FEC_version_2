package com.fec.retail.fog;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * Owns the per-(sensor_type, site_id) reading buffers exclusively on one
 * dedicated worker thread. HTTP handler threads never touch the buffer map
 * directly -- they enqueue an IngestEvent.Ingest and return immediately, so
 * there is no shared-map locking anywhere in this class: mutation only ever
 * happens on the actor thread, one mailbox message at a time.
 *
 * This is the 4th distinct concurrency shape in this CA portfolio: 02 guards
 * one shared HashMap with a single synchronized(lock) block; 04 uses a
 * fenced lock-free ConcurrentHashMap-of-generations scheme; 07 shards a
 * ConcurrentHashMap into per-key ReentrantLock-guarded buckets. Here, no
 * lock or atomic ever touches the buffer at all -- single-writer ownership
 * makes contention structurally impossible instead of merely well-guarded.
 * A flush is itself just another mailbox message (Drain), so it is
 * serialized against ingests by the queue's own FIFO order rather than by
 * any explicit synchronization, and the reply carries both the buffer and
 * units snapshots together so the caller never reads actor-owned state
 * directly from a different thread.
 */
public class BufferActor {

    private final BlockingQueue<IngestEvent> inbox = new LinkedBlockingQueue<>();
    private final Map<SensorKey, List<Double>> buffers = new HashMap<>();
    private final Map<String, String> units = new HashMap<>();
    private Thread worker;
    private volatile boolean running = true;

    /** Called from HTTP handler threads: never blocks on buffer state. */
    public void enqueue(String sensorType, String siteId, String unit, List<Double> values) {
        inbox.add(new IngestEvent.Ingest(sensorType, siteId, unit, values));
    }

    public void start() {
        worker = new Thread(this::runLoop, "buffer-actor");
        worker.setDaemon(true);
        worker.start();
    }

    public void stop() {
        running = false;
        if (worker != null) worker.interrupt();
    }

    private void runLoop() {
        while (running) {
            try {
                handle(inbox.take());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void handle(IngestEvent event) {
        if (event instanceof IngestEvent.Ingest ingest) {
            applyIngest(ingest);
        } else if (event instanceof IngestEvent.Drain drain) {
            drain.reply().complete(snapshotAndClear());
        }
    }

    private void applyIngest(IngestEvent.Ingest ingest) {
        SensorKey key = new SensorKey(ingest.sensorType(), ingest.siteId());
        buffers.computeIfAbsent(key, k -> new ArrayList<>()).addAll(ingest.values());
        if (ingest.unit() != null && !ingest.unit().isEmpty()) units.put(ingest.sensorType(), ingest.unit());
    }

    private BufferSnapshot snapshotAndClear() {
        Map<SensorKey, List<Double>> bufferCopy = new LinkedHashMap<>(buffers);
        buffers.clear();
        return new BufferSnapshot(bufferCopy, Map.copyOf(units));
    }

    /**
     * Blocks the calling thread (the scheduler) until the actor thread has
     * processed the drain in its own mailbox order, guaranteeing every
     * ingest enqueued before this call is included in the snapshot.
     */
    public BufferSnapshot drainAll() {
        CompletableFuture<BufferSnapshot> reply = new CompletableFuture<>();
        inbox.add(new IngestEvent.Drain(reply));
        try {
            return reply.get();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
