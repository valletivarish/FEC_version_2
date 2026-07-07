package com.fec.aquaculture.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.QueueDoesNotExistException;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.net.URI;

/** Dispatches one aggregated window payload per group to the real SQS queue (LocalStack-backed). */
public class QueuePublisher {

    private final SqsClient client;
    private final String queueName;
    private String cachedQueueUrl;

    public QueuePublisher(String endpoint, String region, String queueName) {
        var builder = SqsClient.builder()
            .region(Region.of(region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        if (endpoint != null) builder.endpointOverride(URI.create(endpoint));
        this.client = builder.build();
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
}
