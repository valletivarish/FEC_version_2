package com.fec.aquaculture.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.QueueDoesNotExistException;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/** Dispatches aggregated window payloads to the real SQS queue (LocalStack-backed in dev, real AWS in production). */
public class QueuePublisher {

    private static final int BATCH_LIMIT = 10;

    private final SqsClient client;
    private final String queueName;
    private String cachedQueueUrl;

    public QueuePublisher(String endpoint, String region, String queueName) {
        var builder = SqsClient.builder().region(Region.of(region));
        // LocalStack accepts any static credentials; a real deployment (EC2)
        // must fall through to the SDK's default credential chain instead, so
        // this override stays scoped to the LocalStack-endpoint case only.
        if (endpoint != null) {
            builder.endpointOverride(URI.create(endpoint));
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        this.client = builder.build();
        this.queueName = queueName;
    }

    /** Test-only: bypasses the builder above to inject a pre-built (fake) client directly. */
    QueuePublisher(SqsClient client, String queueName) {
        this.client = client;
        this.queueName = queueName;
    }

    private String queueUrl() {
        if (cachedQueueUrl == null) {
            for (int attempt = 0; attempt < 30; attempt++) {
                try {
                    cachedQueueUrl = client.getQueueUrl(b -> b.queueName(queueName)).queueUrl();
                    return cachedQueueUrl;
                } catch (QueueDoesNotExistException e) {
                    sleep(2000);
                }
            }
            throw new IllegalStateException("queue " + queueName + " never became available");
        }
        return cachedQueueUrl;
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public void publish(String messageBody) {
        client.sendMessage(SendMessageRequest.builder().queueUrl(queueUrl()).messageBody(messageBody).build());
    }

    // One flush cycle can close several (sensor_type, site_id) windows at
    // once; sending each as its own sendMessage() call is one SQS API call
    // per window. Chunk the whole batch at SendMessageBatch's 10-entry limit
    // instead, issuing at most ceil(n/10) calls per flush.
    public void publishBatch(List<String> messageBodies) {
        if (messageBodies.isEmpty()) return;
        String url = queueUrl();
        for (int start = 0; start < messageBodies.size(); start += BATCH_LIMIT) {
            List<String> chunk = messageBodies.subList(start, Math.min(start + BATCH_LIMIT, messageBodies.size()));
            List<SendMessageBatchRequestEntry> entries = new ArrayList<>(chunk.size());
            for (int i = 0; i < chunk.size(); i++) {
                entries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(i)).messageBody(chunk.get(i)).build());
            }
            client.sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(url).entries(entries).build());
        }
    }
}
