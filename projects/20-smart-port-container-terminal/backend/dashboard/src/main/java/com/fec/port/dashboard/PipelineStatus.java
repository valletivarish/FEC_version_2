package com.fec.port.dashboard;

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

/** Health/queue-depth checks against the real AWS SDK v2 client interfaces. */
class PipelineStatus {

    boolean queueReachable(SqsClient sqs, String queueName) {
        try {
            String queueUrl = sqs.getQueueUrl(b -> b.queueName(queueName)).queueUrl();
            sqs.getQueueAttributes(GetQueueAttributesRequest.builder().queueUrl(queueUrl)
                .attributeNames(QueueAttributeName.QUEUE_ARN).build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    boolean lambdaDeployed(LambdaClient lambda, String functionName) {
        try {
            var resp = lambda.getFunction(GetFunctionRequest.builder().functionName(functionName).build());
            return "Active".equals(resp.configuration().stateAsString());
        } catch (Exception e) {
            return false;
        }
    }

    Map<String, Object> queueDepth(SqsClient sqs, String queueName) {
        try {
            String queueUrl = sqs.getQueueUrl(b -> b.queueName(queueName)).queueUrl();
            var attrs = sqs.getQueueAttributes(GetQueueAttributesRequest.builder().queueUrl(queueUrl)
                .attributeNames(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES,
                    QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_NOT_VISIBLE).build()).attributesAsStrings();
            Map<String, Object> depth = new LinkedHashMap<>();
            depth.put("waiting", Integer.parseInt(attrs.get("ApproximateNumberOfMessages")));
            depth.put("in_flight", Integer.parseInt(attrs.get("ApproximateNumberOfMessagesNotVisible")));
            return depth;
        } catch (Exception e) {
            return null;
        }
    }

    // A single Scan(Select=COUNT) call only reports the count within its
    // own ~1MB response page, silently undercounting once the table grows
    // past that -- so this keeps re-issuing the scan with the previous
    // response's LastEvaluatedKey as the new ExclusiveStartKey, summing
    // count across every page, until a page comes back with no key left.
    int itemCount(DynamoDbClient dynamo, String tableName) {
        int total = 0;
        Map<String, AttributeValue> exclusiveStartKey = null;
        do {
            ScanRequest.Builder request = ScanRequest.builder().tableName(tableName).select(Select.COUNT);
            if (exclusiveStartKey != null) request.exclusiveStartKey(exclusiveStartKey);
            ScanResponse response = dynamo.scan(request.build());
            total += response.count();
            exclusiveStartKey = response.hasLastEvaluatedKey() ? response.lastEvaluatedKey() : null;
        } while (exclusiveStartKey != null);
        return total;
    }
}
