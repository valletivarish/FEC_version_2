package com.fec.retail.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/** Genuine SQS dispatch of one aggregate payload per window per group -- the fog never writes to DynamoDB directly. */
public class QueuePublisher {

    private static final int BATCH_LIMIT = 10;

    private final SqsClient client;
    private final String queueUrl;

    public QueuePublisher(String endpointUrl, String region, String queueName) throws InterruptedException {
        var builder = SqsClient.builder().region(Region.of(region));
        // Static test/test creds only apply to LocalStack; real deployments keep their own role creds.
        if (endpointUrl != null) {
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            builder.endpointOverride(URI.create(endpointUrl));
        }
        this.client = builder.build();
        this.queueUrl = resolveQueueUrl(queueName);
    }

    /** Test seam: hands in an already-built client and queue URL, bypassing the builder wiring and queue-url polling above. */
    QueuePublisher(SqsClient client, String queueUrl) {
        this.client = client;
        this.queueUrl = queueUrl;
    }

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

    public void publish(String jsonPayload) {
        client.sendMessage(SendMessageRequest.builder().queueUrl(queueUrl).messageBody(jsonPayload).build());
    }

    /** Ships a window's payloads in as few SendMessageBatch calls as the 10-entry limit allows, recursing on the remainder. */
    public void publishBatch(List<String> jsonPayloads) {
        if (jsonPayloads.isEmpty()) return;
        int end = Math.min(BATCH_LIMIT, jsonPayloads.size());
        sendChunk(jsonPayloads.subList(0, end));
        publishBatch(jsonPayloads.subList(end, jsonPayloads.size()));
    }

    private void sendChunk(List<String> chunk) {
        List<SendMessageBatchRequestEntry> entries = new ArrayList<>(chunk.size());
        for (int i = 0; i < chunk.size(); i++) {
            entries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(i)).messageBody(chunk.get(i)).build());
        }
        client.sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(queueUrl).entries(entries).build());
    }
}
