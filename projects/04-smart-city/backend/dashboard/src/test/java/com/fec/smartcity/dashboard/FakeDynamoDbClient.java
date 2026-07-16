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
                                  List<Integer> scanPageCounts) implements DynamoDbClient {

    public static FakeDynamoDbClient withQueryResults(Map<String, List<Map<String, AttributeValue>>> itemsByMetric) {
        return new FakeDynamoDbClient(itemsByMetric, List.of());
    }

    public static FakeDynamoDbClient withScanCount(int totalItemCount) {
        return new FakeDynamoDbClient(Map.of(), List.of(totalItemCount));
    }

    public static FakeDynamoDbClient withScanPages(Integer... pageCounts) {
        return new FakeDynamoDbClient(Map.of(), List.of(pageCounts));
    }

    @Override
    public QueryResponse query(QueryRequest request) {
        String metric = request.expressionAttributeValues().get(":st").s();
        List<Map<String, AttributeValue>> rows = itemsByMetric.getOrDefault(metric, List.of());
        return QueryResponse.builder().items(rows).build();
    }

    @Override
    public ScanResponse scan(ScanRequest request) {
        int pageIndex = pageIndexOf(request.exclusiveStartKey());
        int count = scanPageCounts.isEmpty() ? 0 : scanPageCounts.get(pageIndex);
        ScanResponse.Builder response = ScanResponse.builder().count(count);
        if (pageIndex + 1 < scanPageCounts.size()) {
            response.lastEvaluatedKey(Map.of("page", AttributeValue.fromN(String.valueOf(pageIndex + 1))));
        }
        return response.build();
    }

    private static int pageIndexOf(Map<String, AttributeValue> exclusiveStartKey) {
        if (exclusiveStartKey == null || exclusiveStartKey.isEmpty()) return 0;
        return Integer.parseInt(exclusiveStartKey.get("page").n());
    }

    @Override
    public String serviceName() {
        return "dynamodb";
    }

    @Override
    public void close() {
    }
}
