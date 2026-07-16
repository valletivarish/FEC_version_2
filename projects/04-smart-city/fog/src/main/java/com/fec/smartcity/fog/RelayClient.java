package com.fec.smartcity.fog;

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
import java.util.function.Supplier;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class RelayClient {

    private static final long INITIAL_DELAY_MS = 250;
    private static final long MAX_DELAY_MS = 4000;
    private static final long GIVE_UP_AFTER_NANOS = TimeUnit.SECONDS.toNanos(60);
    private static final int BATCH_ENTRY_LIMIT = 10;

    private record RelayConfig(String endpointUrl, String region, String queueName) {}

    /**
     * Retries {@code action} with capped exponential backoff until it succeeds
     * or {@code budgetNanos} elapses, at which point {@code onExhausted} is
     * invoked to produce the failure to throw.
     */
    private static <T> T retryWithBackoff(
        Supplier<T> action,
        long initialDelayMillis,
        long maxDelayMillis,
        long budgetNanos,
        Supplier<RuntimeException> onExhausted
    ) throws InterruptedException {
        long deadline = System.nanoTime() + budgetNanos;
        long delayMillis = initialDelayMillis;
        for (;;) {
            try {
                return action.get();
            } catch (Exception exc) {
                if (System.nanoTime() > deadline) {
                    throw onExhausted.get();
                }
                Thread.sleep(delayMillis);
                delayMillis = Math.min(delayMillis * 2, maxDelayMillis);
            }
        }
    }

    private final RelayConfig config;
    private final AtomicReference<SqsClient> clientRef = new AtomicReference<>();
    private volatile String queueUrl;

    public RelayClient(String endpointUrl, String region, String queueName) {
        this.config = new RelayConfig(endpointUrl, region, queueName);
    }

    private SqsClient sqs() {
        return clientRef.updateAndGet(existing -> existing != null ? existing : buildClient());
    }

    private SqsClient buildClient() {
        var builder = SqsClient.builder().region(Region.of(config.region()));
        // config.endpointUrl() is only set for LocalStack; on a real deployment
        // it's null, so calling endpointOverride(URI.create(null)) would throw
        // and the static test/test credentials would shadow the real execution
        // role's credentials. Gate both on the LocalStack endpoint signal.
        if (config.endpointUrl() != null) {
            builder.endpointOverride(URI.create(config.endpointUrl()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        return builder.build();
    }

    private String queueUrl() throws InterruptedException {
        if (queueUrl == null) {
            queueUrl = locateQueue(sqs(), config.queueName());
        }
        return queueUrl;
    }

    private static String locateQueue(SqsClient client, String queueName) throws InterruptedException {
        return retryWithBackoff(
            () -> client.getQueueUrl(GetQueueUrlRequest.builder().queueName(queueName).build()).queueUrl(),
            INITIAL_DELAY_MS,
            MAX_DELAY_MS,
            GIVE_UP_AFTER_NANOS,
            () -> new IllegalStateException("queue " + queueName + " never became available")
        );
    }

    public void emit(String jsonPayload) throws InterruptedException {
        emitBatch(List.of(jsonPayload));
    }

    /**
     * Publishes every payload via SendMessageBatch, chunked at the API's
     * 10-entry limit, instead of one SendMessage call per payload.
     */
    public void emitBatch(List<String> jsonPayloads) throws InterruptedException {
        if (jsonPayloads.isEmpty()) return;
        String url = queueUrl();
        for (int offset = 0; offset < jsonPayloads.size(); offset += BATCH_ENTRY_LIMIT) {
            List<String> chunk = jsonPayloads.subList(offset, Math.min(offset + BATCH_ENTRY_LIMIT, jsonPayloads.size()));
            List<SendMessageBatchRequestEntry> entries = new ArrayList<>();
            for (int i = 0; i < chunk.size(); i++) {
                entries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(i)).messageBody(chunk.get(i)).build());
            }
            sqs().sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(url).entries(entries).build());
        }
    }
}
