package com.fec.retail.processor;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Lambda entry point, registered with a real SQS event-source-mapping.
 * Batch handling attempts every record and only throws once at the end
 * (same attempt-all-then-report-once semantics as the other Java modules in
 * this CA, but folded via Stream.reduce over an immutable Tally record --
 * see Tally.java for how this differs from 02's throw-on-first-failure loop,
 * 04's Collectors.partitioningBy, and 07's mutable BatchTally for-loop).
 */
public class StoreHandler implements RequestHandler<SQSEvent, Map<String, Object>> {

    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "rfi-readings");
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

    private static Tally attemptWrite(SQSEvent.SQSMessage record, DynamoDbClient dynamo, String tableName) {
        try {
            Map<String, AttributeValue> item = RecordMapper.toItem(record.getBody());
            dynamo.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
            return Tally.success();
        } catch (Exception e) {
            return Tally.failed(e.toString());
        }
    }

    static Tally processRecords(List<SQSEvent.SQSMessage> records, DynamoDbClient dynamo, String tableName) {
        return records.stream()
            .map(record -> attemptWrite(record, dynamo, tableName))
            .reduce(Tally.EMPTY, Tally::combine);
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
