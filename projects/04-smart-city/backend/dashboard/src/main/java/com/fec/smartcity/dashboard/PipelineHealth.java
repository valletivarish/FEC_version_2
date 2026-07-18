package com.fec.smartcity.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;
import software.amazon.awssdk.services.dynamodb.model.Select;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.lambda.model.GetFunctionRequest;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesRequest;
import software.amazon.awssdk.services.sqs.model.QueueAttributeName;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

public class PipelineHealth {

    // Reachability verdict for a pipeline dependency: the up/down flag plus a short reason.
    public record Health(boolean up, String detail) {
        public static Health up(String detail) {
            return new Health(true, detail);
        }

        public static Health down(String detail) {
            return new Health(false, detail);
        }
    }

    static <T> T safely(Supplier<T> action, T fallback) {
        try {
            return action.get();
        } catch (Exception e) {
            return fallback;
        }
    }

    private static Optional<String> resolveQueueUrl(SqsClient sqs, String queueName) {
        return safely(() -> Optional.of(sqs.getQueueUrl(b -> b.queueName(queueName)).queueUrl()), Optional.empty());
    }

    private static Map<String, String> queueAttributes(SqsClient sqs, String queueUrl, QueueAttributeName... names) {
        return sqs.getQueueAttributes(GetQueueAttributesRequest.builder().queueUrl(queueUrl)
            .attributeNames(names).build()).attributesAsStrings();
    }

    public static Health queueStatus(SqsClient sqs, String queueName) {
        Optional<String> queueUrl = resolveQueueUrl(sqs, queueName);
        if (queueUrl.isEmpty()) {
            return Health.down("queue url not resolvable for " + queueName);
        }
        return safely(() -> {
            queueAttributes(sqs, queueUrl.get(), QueueAttributeName.QUEUE_ARN);
            return Health.up("queue attributes readable");
        }, Health.down("queue attributes not readable"));
    }

    public static boolean queueReachable(SqsClient sqs, String queueName) {
        return queueStatus(sqs, queueName).up();
    }

    public static Health lambdaStatus(LambdaClient lambda, String functionName) {
        return functionState(lambda, functionName)
            .map(state -> "Active".equals(state)
                ? Health.up("function state Active")
                : Health.down("function state " + state))
            .orElseGet(() -> Health.down("function not deployed"));
    }

    public static boolean lambdaActive(LambdaClient lambda, String functionName) {
        return lambdaStatus(lambda, functionName).up();
    }

    private static Optional<String> functionState(LambdaClient lambda, String functionName) {
        return safely(() -> {
            var resp = lambda.getFunction(GetFunctionRequest.builder().functionName(functionName).build());
            return Optional.of(resp.configuration().stateAsString());
        }, Optional.empty());
    }

    public static Optional<Map<String, Object>> queueDepth(SqsClient sqs, String queueName) {
        return resolveQueueUrl(sqs, queueName)
            .flatMap(queueUrl -> safely(() -> {
                var attrs = queueAttributes(sqs, queueUrl, QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES,
                    QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_NOT_VISIBLE);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("waiting", Integer.parseInt(attrs.get("ApproximateNumberOfMessages")));
                result.put("in_flight", Integer.parseInt(attrs.get("ApproximateNumberOfMessagesNotVisible")));
                return Optional.of(result);
            }, Optional.empty()));
    }

    // A single Scan(Select.COUNT) counts only one ~1MB page, so this pages through lastEvaluatedKey and sums each count.
    public static int itemCount(DynamoDbClient dynamo, String tableName) {
        int total = 0;
        Map<String, AttributeValue> exclusiveStartKey = null;
        for (;;) {
            ScanRequest.Builder request = ScanRequest.builder().tableName(tableName).select(Select.COUNT);
            if (exclusiveStartKey != null) request.exclusiveStartKey(exclusiveStartKey);
            ScanResponse response = dynamo.scan(request.build());
            total += response.count();
            exclusiveStartKey = response.lastEvaluatedKey();
            if (exclusiveStartKey == null || exclusiveStartKey.isEmpty()) {
                return total;
            }
        }
    }
}
