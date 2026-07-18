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
    private static final int SQS_BATCH_CAP = 10;

    private record RelayTarget(String endpointUrl, String region, String queueName) {}

    // Retries action with capped exponential backoff until it succeeds or budgetNanos elapses, then throws onExhausted.
    private static <T> T retryUntilDeadline(
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

    private final RelayTarget target;
    private final AtomicReference<SqsClient> clientRef = new AtomicReference<>();
    private volatile String queueUrl;

    public RelayClient(String endpointUrl, String region, String queueName) {
        this.target = new RelayTarget(endpointUrl, region, queueName);
    }

    private SqsClient sqs() {
        return clientRef.updateAndGet(existing -> existing != null ? existing : connectSqs());
    }

    private SqsClient connectSqs() {
        var builder = SqsClient.builder().region(Region.of(target.region()));
        // endpointUrl is only set for LocalStack; gate the static test credentials on it so a real deployment uses the execution role.
        if (target.endpointUrl() != null) {
            builder.endpointOverride(URI.create(target.endpointUrl()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        return builder.build();
    }

    private String queueUrl() throws InterruptedException {
        if (queueUrl == null) {
            queueUrl = discoverQueueUrl(sqs(), target.queueName());
        }
        return queueUrl;
    }

    private static String discoverQueueUrl(SqsClient client, String queueName) throws InterruptedException {
        return retryUntilDeadline(
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

    // Publishes every payload via SendMessageBatch, chunked at the API's 10-entry limit.
    public void emitBatch(List<String> jsonPayloads) throws InterruptedException {
        if (jsonPayloads.isEmpty()) return;
        String url = queueUrl();
        for (int offset = 0; offset < jsonPayloads.size(); offset += SQS_BATCH_CAP) {
            List<String> batch = jsonPayloads.subList(offset, Math.min(offset + SQS_BATCH_CAP, jsonPayloads.size()));
            List<SendMessageBatchRequestEntry> batchEntries = new ArrayList<>();
            for (int i = 0; i < batch.size(); i++) {
                batchEntries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(i)).messageBody(batch.get(i)).build());
            }
            sqs().sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(url).entries(batchEntries).build());
        }
    }
}
