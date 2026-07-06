package com.fec.industrial.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.net.URI;

public class QueueRelay {

    private final SqsClient client;
    private final String queueUrl;

    public QueueRelay(String endpointUrl, String region, String queueName) throws InterruptedException {
        this.client = SqsClient.builder()
            .endpointOverride(URI.create(endpointUrl))
            .region(Region.of(region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")))
            .build();
        this.queueUrl = locateQueue(queueName);
    }

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
}
