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
    static DynamoDbClient client;

    // Lambda (even under LocalStack) can reuse a warm execution environment
    // across invocations, so the client is cached in a static field instead
    // of being rebuilt on every handleRequest() call.
    static synchronized DynamoDbClient client() {
        if (client == null) {
            String endpoint = System.getenv("AWS_ENDPOINT_URL");
            String region = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
            var builder = DynamoDbClient.builder().region(Region.of(region));
            // Static test/test credentials are only valid for LocalStack. A
            // real Lambda always has AWS_ACCESS_KEY_ID set (its own
            // execution-role credentials), so gating on that variable would
            // still misauthenticate in production -- AWS_ENDPOINT_URL is the
            // actual LocalStack-only signal.
            if (endpoint != null) {
                builder.endpointOverride(URI.create(endpoint))
                    .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            }
            client = builder.build();
        }
        return client;
    }

    static int processRecords(List<SQSEvent.SQSMessage> records, DynamoDbClient dynamo, String tableName) {
        int processed = 0;
        for (SQSEvent.SQSMessage record : records) {
            try {
                Map<String, software.amazon.awssdk.services.dynamodb.model.AttributeValue> item =
                    RecordMapper.toItem(record.getBody());
                dynamo.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
                processed++;
            } catch (Exception e) {
                // Deliberately fail the whole batch on any single bad record
                // rather than skipping it: the SQS event source mapping will
                // then leave the batch unacked and retry it, which is the
                // simplest correct behaviour for this CA's demo scale.
                throw new RuntimeException(e);
            }
        }
        return processed;
    }

    @Override
    public Map<String, Object> handleRequest(SQSEvent event, Context context) {
        int processed = processRecords(event.getRecords(), client(), TABLE_NAME);
        Map<String, Object> result = new HashMap<>();
        result.put("processed", processed);
        return result;
    }
}
