package com.fec.transit.dashboard;

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
    private final List<Integer> scanCountPages;
    private int scanPageIndex = 0;

    FakeDynamoDbClient(Map<String, List<Map<String, AttributeValue>>> itemsBySensorType, int scanCount) {
        this(itemsBySensorType, List.of(scanCount));
    }

    // Simulates a COUNT scan split across several pages reachable only via LastEvaluatedKey -- what storedWindowCount()'s scanPaginator() walks.
    FakeDynamoDbClient(Map<String, List<Map<String, AttributeValue>>> itemsBySensorType, List<Integer> scanCountPages) {
        this.itemsBySensorType = itemsBySensorType;
        this.scanCountPages = scanCountPages;
    }

    @Override
    public QueryResponse query(QueryRequest request) {
        String sensorType = request.expressionAttributeValues().get(":st").s();
        List<Map<String, AttributeValue>> items = itemsBySensorType.getOrDefault(sensorType, List.of());
        return QueryResponse.builder().items(items).build();
    }

    @Override
    public ScanResponse scan(ScanRequest request) {
        int count = scanCountPages.get(scanPageIndex);
        boolean isLastPage = scanPageIndex == scanCountPages.size() - 1;
        scanPageIndex++;
        var response = ScanResponse.builder().count(count);
        if (!isLastPage) {
            response.lastEvaluatedKey(Map.of("id", AttributeValue.fromS("page-" + scanPageIndex)));
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
