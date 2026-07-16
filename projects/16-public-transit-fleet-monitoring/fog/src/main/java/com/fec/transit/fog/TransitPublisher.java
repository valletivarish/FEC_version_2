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

/** SQS dispatch wrapped as a genuine AutoCloseable resource whose close() shuts the SqsClient down, unlike this portfolio's other fog publishers (02, 04, 07, 08, 09) which hold their client forever. */
public class TransitPublisher implements AutoCloseable {

    private static final int BATCH_LIMIT = 10;

    private final SqsClient client;
    private final String queueUrl;

    public TransitPublisher(String endpointUrl, String region, String queueName) throws InterruptedException {
        // endpointOverride/credentialsProvider only apply for LocalStack: a
        // real deployment passes endpointUrl == null, and URI.create(null)
        // would crash the constructor outright, while the static test/test
        // credentials would silently misauthenticate against real AWS.
        SqsClientBuilder builder = SqsClient.builder().region(Region.of(region));
        if (endpointUrl != null) {
            builder.endpointOverride(URI.create(endpointUrl))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        this.client = builder.build();
        this.queueUrl = awaitQueue(queueName);
    }

    /** Test-only entry point: skips the endpoint/credentials builder wiring and the queue-await polling above, since a test double's queue always exists. */
    TransitPublisher(SqsClient client, String queueUrl) {
        this.client = client;
        this.queueUrl = queueUrl;
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

    // Dispatches every payload from a flush cycle as chunked SendMessageBatch
    // calls (10-entry API limit) instead of one SendMessage round-trip per
    // payload -- the whole point of a window flush is that it already holds
    // every aggregate for that cycle in hand at once.
    public void publishBatch(List<String> jsonPayloads) {
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
