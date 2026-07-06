package com.fec.industrial.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.Select;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.lambda.model.GetFunctionRequest;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesRequest;
import software.amazon.awssdk.services.sqs.model.QueueAttributeName;

import java.util.LinkedHashMap;
import java.util.Map;

public class HealthChecks {

    public static boolean queueReachable(SqsClient sqs, String queueName) {
        try {
            String queueUrl = sqs.getQueueUrl(b -> b.queueName(queueName)).queueUrl();
            sqs.getQueueAttributes(GetQueueAttributesRequest.builder().queueUrl(queueUrl)
                .attributeNames(QueueAttributeName.QUEUE_ARN).build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean lambdaActive(LambdaClient lambda, String functionName) {
        try {
            var resp = lambda.getFunction(GetFunctionRequest.builder().functionName(functionName).build());
            return "Active".equals(resp.configuration().stateAsString());
        } catch (Exception e) {
            return false;
        }
    }

    public static Map<String, Object> queueDepth(SqsClient sqs, String queueName) {
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

    public static int scanCount(DynamoDbClient dynamo, String tableName) {
        return dynamo.scan(ScanRequest.builder().tableName(tableName).select(Select.COUNT).build()).count();
    }
}
