package com.fec.industrial.fog;

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

public class QueueRelay {

    private static final int SQS_BATCH_MAX = 10;

    private final SqsClient client;
    private final String queueUrl;

    public QueueRelay(String endpointUrl, String region, String queueName) throws InterruptedException {
        var builder = SqsClient.builder().region(Region.of(region));
        // Only set under LocalStack; a real deployment leaves it null and authenticates through its own IAM role.
        if (endpointUrl != null) {
            builder.endpointOverride(URI.create(endpointUrl))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        this.client = builder.build();
        this.queueUrl = awaitQueueUrl(queueName);
    }

    /** Test seam: injects a pre-built client (and its queue URL) instead of going through the constructor's endpoint/credentials wiring and polling. */
    QueueRelay(SqsClient client, String queueUrl) {
        this.client = client;
        this.queueUrl = queueUrl;
    }

    // Queue is created by LocalStack's bootstrap concurrently with fog startup, so poll (30 x 2s) until it exists.
    private String awaitQueueUrl(String queueName) throws InterruptedException {
        int attempts = 30;
        for (int i = 0; i < attempts; i++) {
            try {
                return client.getQueueUrl(GetQueueUrlRequest.builder().queueName(queueName).build()).queueUrl();
            } catch (Exception exc) {
                Thread.sleep(2000);
            }
        }
        throw new IllegalStateException("queue " + queueName + " never became available");
    }

    public void relaySingle(String jsonPayload) {
        client.sendMessage(SendMessageRequest.builder().queueUrl(queueUrl).messageBody(jsonPayload).build());
    }

    // Chunks a cycle's payloads at SendMessageBatch's 10-entry limit, so a busy cycle costs ceil(n/10) calls instead of n.
    public void relayWindow(List<String> jsonPayloads) {
        if (jsonPayloads.isEmpty()) return;
        for (int start = 0; start < jsonPayloads.size(); start += SQS_BATCH_MAX) {
            List<String> chunk = jsonPayloads.subList(start, Math.min(start + SQS_BATCH_MAX, jsonPayloads.size()));
            List<SendMessageBatchRequestEntry> entries = new ArrayList<>(chunk.size());
            for (int i = 0; i < chunk.size(); i++) {
                entries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(i)).messageBody(chunk.get(i)).build());
            }
            client.sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(queueUrl).entries(entries).build());
        }
    }
}
