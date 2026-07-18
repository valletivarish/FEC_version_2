package com.fec.retail.fog;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/** Mailbox message for BufferActor: Ingest carries readings, Drain requests a snapshot-and-clear reply. */
sealed interface IngestEvent {

    record Ingest(String sensorType, String siteId, String unit, List<Double> values) implements IngestEvent {}

    record Drain(CompletableFuture<BufferSnapshot> reply) implements IngestEvent {}
}
