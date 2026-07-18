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

/** SQS-triggered Lambda entry point; attempts every record and folds the batch outcome into one Tally, throwing only at the end. */
public class StoreHandler implements RequestHandler<SQSEvent, Map<String, Object>> {

    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "rfi-readings");
    private static DynamoDbClient client;

    private static synchronized DynamoDbClient client() {
        if (client == null) {
            String endpoint = System.getenv("AWS_ENDPOINT_URL");
            String region = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
            var builder = DynamoDbClient.builder().region(Region.of(region));
            // Static test/test creds only apply to LocalStack; a real Lambda keeps its own execution-role creds.
            if (endpoint != null) {
                builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
                builder.endpointOverride(URI.create(endpoint));
            }
            client = builder.build();
        }
        return client;
    }

    private static Tally storeRecord(SQSEvent.SQSMessage record, DynamoDbClient dynamo, String tableName) {
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
            .map(record -> storeRecord(record, dynamo, tableName))
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
