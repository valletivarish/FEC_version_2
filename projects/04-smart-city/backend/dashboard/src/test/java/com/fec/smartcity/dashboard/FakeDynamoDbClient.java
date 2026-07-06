package com.fec.smartcity.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;

import java.util.List;
import java.util.Map;

public record FakeDynamoDbClient(Map<String, List<Map<String, AttributeValue>>> itemsByMetric,
                                  int totalItemCount) implements DynamoDbClient {

    public static FakeDynamoDbClient withQueryResults(Map<String, List<Map<String, AttributeValue>>> itemsByMetric) {
        return new FakeDynamoDbClient(itemsByMetric, 0);
    }

    public static FakeDynamoDbClient withScanCount(int totalItemCount) {
        return new FakeDynamoDbClient(Map.of(), totalItemCount);
    }

    @Override
    public QueryResponse query(QueryRequest request) {
        String metric = request.expressionAttributeValues().get(":st").s();
        List<Map<String, AttributeValue>> rows = itemsByMetric.getOrDefault(metric, List.of());
        return QueryResponse.builder().items(rows).build();
    }

    @Override
    public ScanResponse scan(ScanRequest request) {
        return ScanResponse.builder().count(totalItemCount).build();
    }

    @Override
    public String serviceName() {
        return "dynamodb";
    }

    @Override
    public void close() {
    }
}
