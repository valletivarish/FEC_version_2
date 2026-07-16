package com.fec.aquaculture.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;

import java.util.List;
import java.util.Map;

class FakeDynamoDbClient implements DynamoDbClient {

    private final Map<String, List<Map<String, AttributeValue>>> itemsBySensorType;
    private final List<Integer> scanPageCounts;
    private int scanCallsMade = 0;

    FakeDynamoDbClient(Map<String, List<Map<String, AttributeValue>>> itemsBySensorType, int scanCount) {
        this(itemsBySensorType, List.of(scanCount));
    }

    /** scanPageCounts.size() > 1 simulates a table whose Scan(Select=COUNT) spans several pages. */
    FakeDynamoDbClient(Map<String, List<Map<String, AttributeValue>>> itemsBySensorType, List<Integer> scanPageCounts) {
        this.itemsBySensorType = itemsBySensorType;
        this.scanPageCounts = scanPageCounts;
    }

    @Override
    public QueryResponse query(QueryRequest request) {
        String sensorType = request.expressionAttributeValues().get(":st").s();
        List<Map<String, AttributeValue>> items = itemsBySensorType.getOrDefault(sensorType, List.of());
        return QueryResponse.builder().items(items).build();
    }

    @Override
    public ScanResponse scan(ScanRequest request) {
        int pageIndex = scanCallsMade++;
        var response = ScanResponse.builder().count(scanPageCounts.get(pageIndex));
        boolean hasNextPage = pageIndex < scanPageCounts.size() - 1;
        if (hasNextPage) {
            response.lastEvaluatedKey(Map.of("id", AttributeValue.fromS("page-" + (pageIndex + 1))));
        }
        return response.build();
    }

    @Override
    public String serviceName() {
        return "dynamodb";
    }

    @Override
    public void close() {
    }
}
