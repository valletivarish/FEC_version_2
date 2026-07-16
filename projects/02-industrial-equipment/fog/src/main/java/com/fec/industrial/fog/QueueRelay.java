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

    private static final int BATCH_LIMIT = 10;

    private final SqsClient client;
    private final String queueUrl;

    public QueueRelay(String endpointUrl, String region, String queueName) throws InterruptedException {
        var builder = SqsClient.builder().region(Region.of(region));
        // endpointUrl is only set when this is pointed at LocalStack; a real
        // deployment (EC2/ECS) leaves it null and must authenticate through
        // its own attached IAM role instead of this static "test" pair, and
        // URI.create(null) would itself throw before that role is ever tried.
        if (endpointUrl != null) {
            builder.endpointOverride(URI.create(endpointUrl))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        this.client = builder.build();
        this.queueUrl = locateQueue(queueName);
    }

    /** Test seam: injects a pre-built client (and its queue URL) instead of going through the constructor's endpoint/credentials wiring and polling. */
    QueueRelay(SqsClient client, String queueUrl) {
        this.client = client;
        this.queueUrl = queueUrl;
    }

    // docker-compose starts the fog container concurrently with LocalStack's
    // bootstrap script that creates the SQS queue, so the queue frequently
    // does not exist yet the moment this constructor runs. Rather than fail
    // fast, poll with a fixed backoff for up to a minute (30 x 2s) to give
    // the bootstrap container time to finish before giving up for good.
    private String locateQueue(String queueName) throws InterruptedException {
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

    public void emit(String jsonPayload) {
        client.sendMessage(SendMessageRequest.builder().queueUrl(queueUrl).messageBody(jsonPayload).build());
    }

    // A single window cycle can close several (sensor_type, site_id) groups
    // at once; emit()-per-group means one SQS API call per group. This
    // instead chunks the whole cycle's payloads at SendMessageBatch's
    // 10-entry limit, so a busy cycle costs ceil(n/10) calls instead of n.
    public void emitBatch(List<String> jsonPayloads) {
        if (jsonPayloads.isEmpty()) return;
        for (int start = 0; start < jsonPayloads.size(); start += BATCH_LIMIT) {
            List<String> chunk = jsonPayloads.subList(start, Math.min(start + BATCH_LIMIT, jsonPayloads.size()));
            List<SendMessageBatchRequestEntry> entries = new ArrayList<>(chunk.size());
            for (int i = 0; i < chunk.size(); i++) {
                entries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(i)).messageBody(chunk.get(i)).build());
            }
            client.sendMessageBatch(SendMessageBatchRequest.builder().queueUrl(queueUrl).entries(entries).build());
        }
    }
}
