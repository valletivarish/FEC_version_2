package com.fec.industrial.processor;

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

public class Handler implements RequestHandler<SQSEvent, Map<String, Object>> {

    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "fei-readings");
    static DynamoDbClient client;

    // Cached in a static field so warm Lambda invocations reuse the client instead of rebuilding it per SQS batch.
    static synchronized DynamoDbClient client() {
        if (client == null) {
            String endpoint = System.getenv("AWS_ENDPOINT_URL");
            String region = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
            var builder = DynamoDbClient.builder().region(Region.of(region));
            // Only non-null under LocalStack; a real invocation falls through to its own execution-role credentials.
            if (endpoint != null) {
                builder.endpointOverride(URI.create(endpoint))
                    .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            }
            client = builder.build();
        }
        return client;
    }

    static int persistWindows(List<SQSEvent.SQSMessage> records, DynamoDbClient dynamo, String tableName) {
        int processed = 0;
        for (SQSEvent.SQSMessage record : records) {
            try {
                Map<String, software.amazon.awssdk.services.dynamodb.model.AttributeValue> item =
                    Reshape.toDynamoItem(record.getBody());
                dynamo.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
                processed++;
            } catch (Exception e) {
                // Fail the whole batch on any bad record so SQS retries it; no partial-batch-failure reporting configured.
                throw new RuntimeException(e);
            }
        }
        return processed;
    }

    @Override
    public Map<String, Object> handleRequest(SQSEvent event, Context context) {
        int processed = persistWindows(event.getRecords(), client(), TABLE_NAME);
        Map<String, Object> result = new HashMap<>();
        result.put("processed", processed);
        return result;
    }
}
