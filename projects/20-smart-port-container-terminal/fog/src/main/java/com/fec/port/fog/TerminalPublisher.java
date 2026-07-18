package com.fec.port.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/** Batches every group from a flush cycle into ONE SendMessageBatchRequest (chunked at 10 entries) instead of one sendMessage call per group, with lazily-resolved queue URL backed by linear (not fixed or exponential) backoff. */
public class TerminalPublisher {

    private static final int MAX_ATTEMPTS = 20;
    private static final long INITIAL_DELAY_MS = 500;
    private static final long MAX_DELAY_MS = 4000;
    private static final int BATCH_LIMIT = 10;

    private final SqsClient client;
    private final String queueName;
    private final Object resolveLock = new Object();
    private volatile String queueUrl;

    public TerminalPublisher(String endpointUrl, String region, String queueName) {
        var builder = SqsClient.builder().region(Region.of(region));
        // Static test/test credentials are only valid against LocalStack.
        // A real deployment (EC2/Lambda) has no endpointUrl override and
        // must fall through to the SDK's own default credential chain
        // (instance profile / execution role), not this hardcoded pair.
        if (endpointUrl != null) {
            builder.endpointOverride(URI.create(endpointUrl))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        this.client = builder.build();
        this.queueName = queueName;
    }

    private String resolveQueueUrl() {
        String cached = queueUrl;
        if (cached != null) return cached;
        synchronized (resolveLock) {
            if (queueUrl != null) return queueUrl;
            long delayMs = INITIAL_DELAY_MS;
            for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    queueUrl = client.getQueueUrl(GetQueueUrlRequest.builder().queueName(queueName).build()).queueUrl();
                    return queueUrl;
                } catch (Exception exc) {
                    if (attempt == MAX_ATTEMPTS) {
                        throw new IllegalStateException("queue " + queueName + " never became available", exc);
                    }
                    sleep(delayMs);
                    delayMs = Math.min(delayMs + INITIAL_DELAY_MS, MAX_DELAY_MS);
                }
            }
            throw new IllegalStateException("queue " + queueName + " never became available");
        }
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted while waiting for the queue to become available", ie);
        }
    }

    /** One publication = one already-evaluated window plus the alerts fired for it. */
    public record Publication(WindowAggregate window, List<String> alerts) {}

    public void publishBatch(List<Publication> batch) {
        if (batch.isEmpty()) return;
        String url = resolveQueueUrl();
        for (int offset = 0; offset < batch.size(); offset += BATCH_LIMIT) {
            List<Publication> chunk = batch.subList(offset, Math.min(offset + BATCH_LIMIT, batch.size()));
            List<SendMessageBatchRequestEntry> entries = new ArrayList<>();
            for (int i = 0; i < chunk.size(); i++) {
                Publication p = chunk.get(i);
                entries.add(SendMessageBatchRequestEntry.builder()
                    .id("m" + i)
                    .messageBody(BatchPayloadJson.build(p.window(), p.alerts()))
                    .build());
            }
            client.sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(url).entries(entries).build());
        }
    }
}
