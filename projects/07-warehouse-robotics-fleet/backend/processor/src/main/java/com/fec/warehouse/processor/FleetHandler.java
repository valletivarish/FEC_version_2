package com.fec.warehouse.processor;

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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class FleetHandler implements RequestHandler<SQSEvent, Map<String, Object>> {

    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "wrf-readings");
    private static DynamoDbClient client;

    private static synchronized DynamoDbClient client() {
        if (client == null) {
            String endpoint = System.getenv("AWS_ENDPOINT_URL");
            String region = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
            var builder = DynamoDbClient.builder().region(Region.of(region));
            if (endpoint != null) {
                builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
                builder.endpointOverride(URI.create(endpoint));
            }
            client = builder.build();
        }
        return client;
    }

    static final class BatchTally {
        int written = 0;
        final List<String> errors = new ArrayList<>();

        void recordSuccess() {
            written++;
        }

        void recordFailure(String reason) {
            errors.add(reason);
        }

        boolean clean() {
            return errors.isEmpty();
        }
    }

    static BatchTally processRecords(List<SQSEvent.SQSMessage> records, DynamoDbClient dynamo, String tableName) {
        BatchTally tally = new BatchTally();
        for (SQSEvent.SQSMessage record : records) {
            try {
                Map<String, AttributeValue> item = RecordMapper.toItem(record.getBody());
                dynamo.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
                tally.recordSuccess();
            } catch (Exception e) {
                tally.recordFailure(e.toString());
            }
        }
        return tally;
    }

    @Override
    public Map<String, Object> handleRequest(SQSEvent event, Context context) {
        BatchTally tally = processRecords(event.getRecords(), client(), TABLE_NAME);
        if (!tally.clean()) {
            throw new RuntimeException(tally.errors.size() + " of " + event.getRecords().size()
                + " record(s) failed: " + tally.errors);
        }
        Map<String, Object> result = new HashMap<>();
        result.put("processed", tally.written);
        return result;
    }
}
