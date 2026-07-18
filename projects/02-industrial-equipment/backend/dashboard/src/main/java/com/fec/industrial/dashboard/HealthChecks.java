package com.fec.industrial.dashboard;

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

public class HealthChecks {

    // No ping API for SQS, so reachability is inferred from resolving the queue URL and fetching one cheap attribute.
    public static boolean queueAvailable(SqsClient sqs, String queueName) {
        try {
            String queueUrl = sqs.getQueueUrl(b -> b.queueName(queueName)).queueUrl();
            sqs.getQueueAttributes(GetQueueAttributesRequest.builder().queueUrl(queueUrl)
                .attributeNames(QueueAttributeName.QUEUE_ARN).build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean lambdaHealthy(LambdaClient lambda, String functionName) {
        try {
            var resp = lambda.getFunction(GetFunctionRequest.builder().functionName(functionName).build());
            return "Active".equals(resp.configuration().stateAsString());
        } catch (Exception e) {
            return false;
        }
    }

    public static Map<String, Object> queueBacklog(SqsClient sqs, String queueName) {
        try {
            String queueUrl = sqs.getQueueUrl(b -> b.queueName(queueName)).queueUrl();
            var attrs = sqs.getQueueAttributes(GetQueueAttributesRequest.builder().queueUrl(queueUrl)
                .attributeNames(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES,
                    QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_NOT_VISIBLE).build()).attributesAsStrings();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("waiting", Integer.parseInt(attrs.get("ApproximateNumberOfMessages")));
            result.put("in_flight", Integer.parseInt(attrs.get("ApproximateNumberOfMessagesNotVisible")));
            return result;
        } catch (Exception e) {
            return null;
        }
    }

    // Select.COUNT returns only the matched count; loop over pages via exclusiveStartKey so a multi-page table is fully summed.
    public static int storedRecordCount(DynamoDbClient dynamo, String tableName) {
        int total = 0;
        Map<String, AttributeValue> lastKey = null;
        do {
            ScanRequest.Builder req = ScanRequest.builder().tableName(tableName).select(Select.COUNT);
            if (lastKey != null) req.exclusiveStartKey(lastKey);
            ScanResponse page = dynamo.scan(req.build());
            total += page.count();
            lastKey = page.lastEvaluatedKey();
        } while (lastKey != null && !lastKey.isEmpty());
        return total;
    }
}
