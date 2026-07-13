package com.fec.transit.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.net.URI;

/** SQS dispatch wrapped as a genuine AutoCloseable resource whose close() shuts the SqsClient down, unlike this portfolio's other fog publishers (02, 04, 07, 08, 09) which hold their client forever. */
public class TransitPublisher implements AutoCloseable {

    private final SqsClient client;
    private final String queueUrl;

    public TransitPublisher(String endpointUrl, String region, String queueName) throws InterruptedException {
        this.client = SqsClient.builder()
            .endpointOverride(URI.create(endpointUrl))
            .region(Region.of(region))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")))
            .build();
        this.queueUrl = awaitQueue(queueName);
    }

    // docker-compose starts fog concurrently with LocalStack's bootstrap
    // script that creates the SQS queue, so the queue frequently does not
    // exist yet the moment this constructor runs. Poll with a fixed backoff
    // for up to a minute before giving up for good.
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

    @Override
    public void close() {
        client.close();
    }
}
