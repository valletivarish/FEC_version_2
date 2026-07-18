package com.fec.transit.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.SqsClientBuilder;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/** SQS dispatch wrapped as an AutoCloseable resource whose close() shuts the SqsClient down. */
public class TransitPublisher implements AutoCloseable {

    private static final int BATCH_LIMIT = 10;

    private final SqsClient client;
    private final String queueUrl;

    public TransitPublisher(String endpointUrl, String region, String queueName) throws InterruptedException {
        // endpointOverride/credentialsProvider apply only for LocalStack; a real deployment passes endpointUrl == null.
        SqsClientBuilder builder = SqsClient.builder().region(Region.of(region));
        if (endpointUrl != null) {
            builder.endpointOverride(URI.create(endpointUrl))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        this.client = builder.build();
        this.queueUrl = resolveQueueUrl(queueName);
    }

    /** Test-only entry point: skips the builder wiring and queue-await polling, since a test double's queue always exists. */
    TransitPublisher(SqsClient client, String queueUrl) {
        this.client = client;
        this.queueUrl = queueUrl;
    }

    // fog can start before LocalStack has created the queue, so poll with a fixed backoff for up to a minute.
    private String resolveQueueUrl(String queueName) throws InterruptedException {
        for (int attempt = 0; attempt < 30; attempt++) {
            try {
                return client.getQueueUrl(GetQueueUrlRequest.builder().queueName(queueName).build()).queueUrl();
            } catch (Exception exc) {
                Thread.sleep(2000);
            }
        }
        throw new IllegalStateException("queue " + queueName + " never became available");
    }

    // Dispatches a whole flush cycle as chunked SendMessageBatch calls (10-entry API limit) rather than one send per payload.
    public void dispatchBatch(List<String> jsonPayloads) {
        for (int offset = 0; offset < jsonPayloads.size(); offset += BATCH_LIMIT) {
            List<String> chunk = jsonPayloads.subList(offset, Math.min(offset + BATCH_LIMIT, jsonPayloads.size()));
            List<SendMessageBatchRequestEntry> entries = new ArrayList<>(chunk.size());
            for (int i = 0; i < chunk.size(); i++) {
                entries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(i)).messageBody(chunk.get(i)).build());
            }
            client.sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(queueUrl).entries(entries).build());
        }
    }

    @Override
    public void close() {
        client.close();
    }
}
