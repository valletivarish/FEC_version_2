package com.fec.retail.fog;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;

/** Single-writer actor thread owns the till buffers; ingest handlers never block on them. */
public class BufferActor {

    private final BlockingQueue<IngestEvent> intake = new LinkedBlockingQueue<>();
    private final Map<SensorKey, List<Double>> readingBins = new HashMap<>();
    private final Map<String, String> unitByType = new HashMap<>();
    private Thread tallyThread;
    private volatile boolean trading = true;

    /** Called from HTTP handler threads: never blocks on buffer state. */
    public void enqueue(String sensorType, String siteId, String unit, List<Double> values) {
        intake.add(new IngestEvent.Ingest(sensorType, siteId, unit, values));
    }

    public void start() {
        tallyThread = new Thread(this::serviceIntake, "buffer-actor");
        tallyThread.setDaemon(true);
        tallyThread.start();
    }

    public void stop() {
        trading = false;
        if (tallyThread != null) tallyThread.interrupt();
    }

    private void serviceIntake() {
        while (trading) {
            try {
                applyEvent(intake.take());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void applyEvent(IngestEvent event) {
        if (event instanceof IngestEvent.Ingest ingest) {
            stockReadings(ingest);
        } else if (event instanceof IngestEvent.Drain drain) {
            drain.reply().complete(sealAndReset());
        }
    }

    private void stockReadings(IngestEvent.Ingest ingest) {
        SensorKey key = new SensorKey(ingest.sensorType(), ingest.siteId());
        readingBins.computeIfAbsent(key, k -> new ArrayList<>()).addAll(ingest.values());
        if (ingest.unit() != null && !ingest.unit().isEmpty()) unitByType.put(ingest.sensorType(), ingest.unit());
    }

    private BufferSnapshot sealAndReset() {
        Map<SensorKey, List<Double>> binCopy = new LinkedHashMap<>(readingBins);
        readingBins.clear();
        return new BufferSnapshot(binCopy, Map.copyOf(unitByType));
    }

    /** Blocks the scheduler until the actor drains in mailbox order, capturing every prior ingest. */
    public BufferSnapshot drainAll() {
        CompletableFuture<BufferSnapshot> reply = new CompletableFuture<>();
        intake.add(new IngestEvent.Drain(reply));
        try {
            return reply.get();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
