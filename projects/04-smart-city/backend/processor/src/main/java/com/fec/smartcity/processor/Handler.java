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
    private static final AtomicReference<DynamoDbClient> DYNAMO_REF = new AtomicReference<>();

    private record DynamoTarget(String endpoint, String region) {
        static DynamoTarget fromEnv() {
            return new DynamoTarget(System.getenv("AWS_ENDPOINT_URL"),
                System.getenv().getOrDefault("AWS_REGION", "eu-west-1"));
        }
    }

    private static final DynamoTarget DYNAMO_TARGET = DynamoTarget.fromEnv();

    private static DynamoDbClient openDynamo() {
        var builder = DynamoDbClient.builder().region(Region.of(DYNAMO_TARGET.region()));
        // endpoint is only set for LocalStack; gate the static test credentials on it so a real Lambda uses its execution role.
        if (DYNAMO_TARGET.endpoint() != null) {
            builder.endpointOverride(URI.create(DYNAMO_TARGET.endpoint()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        return builder.build();
    }

    static DynamoDbClient dynamo() {
        return DYNAMO_REF.updateAndGet(existing -> existing != null ? existing : openDynamo());
    }

    // Outcome of a single SQS message write attempt.
    private record RowWrite(boolean succeeded, String failureReason) {
        static RowWrite success() {
            return new RowWrite(true, null);
        }

        static RowWrite failure(Exception cause) {
            return new RowWrite(false, cause.toString());
        }
    }

    // Outcome of a whole batch: how many messages landed in DynamoDB plus the failure detail for each that didn't.
    record Result(int processed, List<String> failures) {
        boolean hasFailures() {
            return !failures.isEmpty();
        }
    }

    private static RowWrite writeRow(SQSEvent.SQSMessage record, DynamoDbClient client, String tableName) {
        try {
            Map<String, AttributeValue> item = Normalizer.normalize(record.getBody());
            client.putItem(PutItemRequest.builder().tableName(tableName).item(item).build());
            return RowWrite.success();
        } catch (Exception e) {
            return RowWrite.failure(e);
        }
    }

    static Result processRecords(List<SQSEvent.SQSMessage> records, DynamoDbClient client, String tableName) {
        Map<Boolean, List<RowWrite>> partitioned = records.stream()
            .map(record -> writeRow(record, client, tableName))
            .collect(Collectors.partitioningBy(RowWrite::succeeded));

        int processed = partitioned.get(true).size();
        List<String> failures = partitioned.get(false).stream()
            .map(RowWrite::failureReason)
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
