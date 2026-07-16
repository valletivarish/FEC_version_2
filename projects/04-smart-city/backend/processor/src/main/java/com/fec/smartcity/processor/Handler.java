package com.fec.smartcity.processor;

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
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

public class Handler implements RequestHandler<SQSEvent, Map<String, Object>> {

    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "fsc-readings");
    private static final AtomicReference<DynamoDbClient> CLIENT_REF = new AtomicReference<>();

    private record ClientConfig(String endpoint, String region) {
        static ClientConfig fromEnv() {
            return new ClientConfig(System.getenv("AWS_ENDPOINT_URL"),
                System.getenv().getOrDefault("AWS_REGION", "eu-west-1"));
        }
    }

    private static final ClientConfig CLIENT_CONFIG = ClientConfig.fromEnv();

    private static DynamoDbClient buildClient() {
        var builder = DynamoDbClient.builder().region(Region.of(CLIENT_CONFIG.region()));
        // CLIENT_CONFIG.endpoint() is only set for LocalStack. In a real Lambda
        // invocation it's null, and AWS always injects an AWS_ACCESS_KEY_ID for
        // the function's execution role -- so the static test/test credentials
        // must only be applied against the LocalStack endpoint, never always-on,
        // or every DynamoDB call in production would misauthenticate.
        if (CLIENT_CONFIG.endpoint() != null) {
            builder.endpointOverride(URI.create(CLIENT_CONFIG.endpoint()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        return builder.build();
    }

    static DynamoDbClient dynamo() {
        return CLIENT_REF.updateAndGet(existing -> existing != null ? existing : buildClient());
    }

    /**
     * Outcome of a single SQS message write attempt.
     */
    private record WriteAttempt(boolean succeeded, String failureReason) {
        static WriteAttempt success() {
            return new WriteAttempt(true, null);
        }

        static WriteAttempt failure(Exception cause) {
            return new WriteAttempt(false, cause.toString());
        }
    }

    /**
     * Outcome of a whole batch: how many messages landed in DynamoDB, plus the
     * failure detail for each one that didn't.
     */
    record Result(int processed, List<String> failures) {
        boolean hasFailures() {
            return !failures.isEmpty();
        }
    }

    private static WriteAttempt attemptWrite(SQSEvent.SQSMessage record, DynamoDbClient client, String tableName) {
        try {
            Map<String, AttributeValue> item = Normalizer.normalize(record.getBody());
            client.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
            return WriteAttempt.success();
        } catch (Exception e) {
            return WriteAttempt.failure(e);
        }
    }

    static Result processRecords(List<SQSEvent.SQSMessage> records, DynamoDbClient client, String tableName) {
        Map<Boolean, List<WriteAttempt>> bySuccess = records.stream()
            .map(record -> attemptWrite(record, client, tableName))
            .collect(Collectors.partitioningBy(WriteAttempt::succeeded));

        int processed = bySuccess.get(true).size();
        List<String> failures = bySuccess.get(false).stream()
            .map(WriteAttempt::failureReason)
            .collect(Collectors.toUnmodifiableList());

        return new Result(processed, failures);
    }

    @Override
    public Map<String, Object> handleRequest(SQSEvent event, Context context) {
        Result result = processRecords(event.getRecords(), dynamo(), TABLE_NAME);

        if (result.hasFailures()) {
            throw new RuntimeException(result.failures().size() + " of " + event.getRecords().size()
                + " record(s) failed: " + result.failures());
        }

        Map<String, Object> response = new HashMap<>();
        response.put("processed", result.processed());
        return response;
    }
}
