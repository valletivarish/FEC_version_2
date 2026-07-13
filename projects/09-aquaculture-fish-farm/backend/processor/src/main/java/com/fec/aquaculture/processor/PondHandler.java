package com.fec.aquaculture.processor;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

/** Writes each record's DynamoDB put as its own CompletableFuture on a bounded fixed-size executor, then joins and folds all outcomes into one immutable Tally -- the portfolio's only genuinely parallel (vs. sequential for-loop or stream) attempt-all-then-report-once record processor. */
public class PondHandler implements RequestHandler<SQSEvent, Map<String, Object>> {

    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "aff-readings");
    private static DynamoDbClient client;

    private static synchronized DynamoDbClient client() {
        if (client == null) {
            String endpoint = System.getenv("AWS_ENDPOINT_URL");
            String region = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
            var builder = DynamoDbClient.builder()
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            if (endpoint != null) builder.endpointOverride(URI.create(endpoint));
            client = builder.build();
        }
        return client;
    }

    static Tally attemptWrite(SQSEvent.SQSMessage record, DynamoDbClient dynamo, String tableName) {
        try {
            var item = RecordMapper.toItem(record.getBody());
            dynamo.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
            return Tally.success();
        } catch (Exception e) {
            return Tally.failed(e.toString());
        }
    }

    static Tally processRecords(List<SQSEvent.SQSMessage> records, DynamoDbClient dynamo, String tableName) {
        if (records.isEmpty()) return Tally.EMPTY;

        ExecutorService executor = Executors.newFixedThreadPool(Math.min(4, records.size()));
        try {
            List<CompletableFuture<Tally>> futures = records.stream()
                .map(record -> CompletableFuture.supplyAsync(() -> attemptWrite(record, dynamo, tableName), executor))
                .collect(Collectors.toList());

            return futures.stream()
                .map(CompletableFuture::join)
                .reduce(Tally.EMPTY, Tally::combine);
        } finally {
            executor.shutdown();
        }
    }

    @Override
    public Map<String, Object> handleRequest(SQSEvent event, Context context) {
        Tally tally = processRecords(event.getRecords(), client(), TABLE_NAME);

        if (!tally.clean()) {
            throw new RuntimeException(tally.failures().size() + " of " + event.getRecords().size()
                + " record(s) failed: " + tally.failures());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("processed", tally.written());
        return result;
    }
}
