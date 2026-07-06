package com.fec.smartcity.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.net.URI;
import java.util.function.Supplier;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class RelayClient {

    private static final long INITIAL_DELAY_MS = 250;
    private static final long MAX_DELAY_MS = 4000;
    private static final long GIVE_UP_AFTER_NANOS = TimeUnit.SECONDS.toNanos(60);

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
        return SqsClient.builder()
            .endpointOverride(URI.create(config.endpointUrl()))
            .region(Region.of(config.region()))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")))
            .build();
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
        sqs().sendMessage(SendMessageRequest.builder().queueUrl(queueUrl()).messageBody(jsonPayload).build());
    }
}
