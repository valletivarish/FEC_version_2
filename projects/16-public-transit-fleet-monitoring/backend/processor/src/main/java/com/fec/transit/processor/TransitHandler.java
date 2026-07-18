package com.fec.transit.processor;

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

/** Lambda entry point, wired to the ptf-depot-agg SQS queue via a real event source mapping. */
public class TransitHandler implements RequestHandler<SQSEvent, Map<String, Object>> {

    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "ptf-readings");
    static DynamoDbClient dynamo;

    // Cache the client in a static field so a warm execution environment reuses it across invocations.
    static synchronized DynamoDbClient dynamo() {
        if (dynamo == null) {
            String endpoint = System.getenv("AWS_ENDPOINT_URL");
            String region = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
            var builder = DynamoDbClient.builder().region(Region.of(region));
            // Static test/test credentials only work under LocalStack; AWS_ENDPOINT_URL is the only reliable LocalStack signal.
            if (endpoint != null) {
                builder.endpointOverride(URI.create(endpoint))
                    .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            }
            dynamo = builder.build();
        }
        return dynamo;
    }

    static int storeWindows(List<SQSEvent.SQSMessage> messages, DynamoDbClient dynamo, String tableName) {
        int stored = 0;
        for (SQSEvent.SQSMessage message : messages) {
            try {
                Map<String, software.amazon.awssdk.services.dynamodb.model.AttributeValue> item =
                    RecordMapper.toWindowItem(message.getBody());
                dynamo.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
                stored++;
            } catch (Exception e) {
                // Fail the whole batch on any bad record so the SQS mapping leaves it unacked and retries.
                throw new RuntimeException(e);
            }
        }
        return stored;
    }

    @Override
    public Map<String, Object> handleRequest(SQSEvent event, Context context) {
        int stored = storeWindows(event.getRecords(), dynamo(), TABLE_NAME);
        Map<String, Object> result = new HashMap<>();
        result.put("processed", stored);
        return result;
    }
}
