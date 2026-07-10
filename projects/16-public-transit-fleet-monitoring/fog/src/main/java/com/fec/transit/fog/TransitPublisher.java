package com.fec.transit.fog;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.net.URI;

/**
 * SQS dispatch wrapped as a genuine AutoCloseable resource -- close() shuts
 * the underlying SqsClient down -- instead of the plain
 * hold-a-client-forever instance classes every other fog publisher in this
 * portfolio uses (02's QueueRelay, 04's RelayClient, 07's RelayPublisher,
 * 08's QueuePublisher, 09's QueuePublisher all build an SqsClient in their
 * constructor and never release it). main() below keeps one open for the
 * container's entire lifetime deliberately -- the process only ever exits by
 * being killed -- but this is the shape a try-with-resources caller (a
 * short-lived CLI tool, or a test) would actually use it in.
 */
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
