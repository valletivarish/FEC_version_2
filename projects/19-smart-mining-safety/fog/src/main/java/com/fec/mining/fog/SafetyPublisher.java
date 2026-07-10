package com.fec.mining.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsAsyncClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageResponse;

import java.net.URI;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;

/**
 * Publishes aggregated window payloads to SQS using the ASYNC AWS SDK v2
 * client (SqsAsyncClient), not the synchronous SqsClient every other Java
 * fog sibling in this portfolio uses (02's QueueRelay, 04's RelayClient, 07's
 * RelayPublisher, 08's and 09's QueuePublisher, 16's TransitPublisher all
 * wrap software.amazon.awssdk.services.sqs.SqsClient).
 *
 * Queue-URL resolution is a non-blocking retry chain built from
 * CompletableFuture.exceptionallyComposeAsync() + CompletableFuture's
 * delayedExecutor(), not a blocking for-loop with Thread.sleep -- unlike
 * every sibling's fixed 30-attempt/2-second Thread.sleep retry loop (02,
 * 07, 08, 09, 16) or 04's synchronous exponential-backoff retryWithBackoff()
 * helper, the calling thread here is never parked while LocalStack finishes
 * creating the queue; each retry attempt schedules the next one on a
 * delayed executor and returns immediately.
 */
public class SafetyPublisher {

    private static final int MAX_ATTEMPTS = 30;
    private static final long RETRY_DELAY_SECONDS = 2;

    private final SqsAsyncClient client;
    private final String queueName;
    private volatile String queueUrl;

    public SafetyPublisher(String endpointUrl, String region, String queueName) {
        var builder = SqsAsyncClient.builder()
            .region(Region.of(region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        if (endpointUrl != null) builder.endpointOverride(URI.create(endpointUrl));
        this.client = builder.build();
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
}
