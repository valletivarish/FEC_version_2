package com.fec.warehouse.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchResponse;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

public class RelayPublisher {

    private static final int BATCH_LIMIT = 10;

    private final SqsClient client;
    private final String queueUrl;

    public RelayPublisher(String endpointUrl, String region, String queueName) throws InterruptedException {
        var builder = SqsClient.builder().region(Region.of(region));
        if (endpointUrl != null) {
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            builder.endpointOverride(URI.create(endpointUrl));
        }
        this.client = builder.build();
        this.queueUrl = awaitQueue(queueName);
    }

    /** Test seam: injects a real or stub SqsClient directly, skipping queue-url polling. */
    RelayPublisher(SqsClient client, String queueUrl) {
        this.client = client;
        this.queueUrl = queueUrl;
    }

    private String awaitQueue(String queueName) throws InterruptedException {
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

    // Chunks a whole window's payloads into as few SendMessageBatch calls as the 10-entry limit allows.
    public List<SendMessageBatchResponse> publishBatch(List<String> jsonPayloads) {
        List<SendMessageBatchResponse> responses = new ArrayList<>();
        for (int start = 0; start < jsonPayloads.size(); start += BATCH_LIMIT) {
            int end = Math.min(start + BATCH_LIMIT, jsonPayloads.size());
            List<SendMessageBatchRequestEntry> entries = new ArrayList<>();
            for (int i = start; i < end; i++) {
                entries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(i)).messageBody(jsonPayloads.get(i)).build());
            }
            responses.add(client.sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(queueUrl).entries(entries).build()));
        }
        return responses;
    }
}
