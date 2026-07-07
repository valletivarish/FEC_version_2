package com.fec.retail.fog;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Mailbox message consumed exclusively by BufferActor's single worker thread.
 * Ingest carries new readings; Drain asks the actor to snapshot-and-clear its
 * whole buffer map and hand the snapshot back through a future -- both kinds
 * flow through the same queue so a flush always sees every ingest that was
 * enqueued ahead of it, without either side ever taking a lock.
 */
sealed interface IngestEvent {

    record Ingest(String sensorType, String siteId, String unit, List<Double> values) implements IngestEvent {}

    record Drain(CompletableFuture<BufferSnapshot> reply) implements IngestEvent {}
}
