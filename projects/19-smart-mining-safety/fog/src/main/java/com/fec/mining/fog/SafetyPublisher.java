package com.fec.mining.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsAsyncClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchResponse;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageResponse;

import java.net.URI;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

// Resolves the queue URL via a non-blocking exceptionallyComposeAsync()+delayedExecutor() retry chain, never parking the thread.
public class SafetyPublisher {

    private static final int MAX_ATTEMPTS = 30;
    private static final long RETRY_DELAY_SECONDS = 2;

    private final SqsAsyncClient client;
    private final String queueName;
    private volatile String queueUrl;

    public SafetyPublisher(String endpointUrl, String region, String queueName) {
        var builder = SqsAsyncClient.builder().region(Region.of(region));
        // Gated on endpointUrl so EC2 falls through to its own attached IAM role.
        if (endpointUrl != null) {
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            builder.endpointOverride(URI.create(endpointUrl));
        }
        this.client = builder.build();
        this.queueName = queueName;
    }

    // Test seam: injects a spy SqsAsyncClient instead of building a real one.
    SafetyPublisher(SqsAsyncClient client, String queueName) {
        this.client = client;
        this.queueName = queueName;
    }

    CompletableFuture<String> resolveQueue() {
        if (queueUrl != null) return CompletableFuture.completedFuture(queueUrl);
        return attemptResolve(1);
    }

    private CompletableFuture<String> attemptResolve(int attempt) {
        return client.getQueueUrl(GetQueueUrlRequest.builder().queueName(queueName).build())
            .thenApply(response -> {
                queueUrl = response.queueUrl();
                return queueUrl;
            })
            .exceptionallyComposeAsync(error -> {
                if (attempt >= MAX_ATTEMPTS) {
                    return CompletableFuture.failedFuture(new CompletionException(
                        new IllegalStateException("queue " + queueName + " never became available", error)));
                }
                return CompletableFuture
                    .supplyAsync(() -> null, CompletableFuture.delayedExecutor(RETRY_DELAY_SECONDS, TimeUnit.SECONDS))
                    .thenCompose(ignored -> attemptResolve(attempt + 1));
            });
    }

    public CompletableFuture<SendMessageResponse> emit(String jsonPayload) {
        return resolveQueue().thenCompose(url ->
            client.sendMessage(SendMessageRequest.builder().queueUrl(url).messageBody(jsonPayload).build()));
    }

    private static final int BATCH_LIMIT = 10;

    /** Chunks a whole window's payloads into as few SendMessageBatch calls as the 10-entry limit allows, instead of one sendMessage() per payload. */
    public CompletableFuture<List<SendMessageBatchResponse>> emitBatch(List<String> jsonPayloads) {
        if (jsonPayloads.isEmpty()) return CompletableFuture.completedFuture(List.of());
        return resolveQueue().thenCompose(url -> {
            int chunkCount = (jsonPayloads.size() + BATCH_LIMIT - 1) / BATCH_LIMIT;
            List<CompletableFuture<SendMessageBatchResponse>> chunkFutures = IntStream.range(0, chunkCount)
                .mapToObj(chunkIndex -> {
                    int start = chunkIndex * BATCH_LIMIT;
                    int end = Math.min(start + BATCH_LIMIT, jsonPayloads.size());
                    List<SendMessageBatchRequestEntry> entries = IntStream.range(start, end)
                        .mapToObj(i -> SendMessageBatchRequestEntry.builder()
                            .id(Integer.toString(i))
                            .messageBody(jsonPayloads.get(i))
                            .build())
                        .collect(Collectors.toList());
                    return client.sendMessageBatch(SendMessageBatchRequest.builder()
                        .queueUrl(url).entries(entries).build());
                })
                .collect(Collectors.toList());
            return CompletableFuture.allOf(chunkFutures.toArray(new CompletableFuture[0]))
                .thenApply(ignored -> chunkFutures.stream().map(CompletableFuture::join).collect(Collectors.toList()));
        });
    }
}
