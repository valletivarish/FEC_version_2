package com.fec.port.dashboard;

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
    private int scanPageIndex = 0;

    FakeDynamoDbClient(Map<String, List<Map<String, AttributeValue>>> itemsBySensorType, int scanCount) {
        this(itemsBySensorType, List.of(scanCount));
    }

    /** scanPageCounts.size() > 1 simulates a Scan(Select=COUNT) result split across that many pages. */
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
        int count = scanPageCounts.get(scanPageIndex);
        boolean morePagesRemain = scanPageIndex < scanPageCounts.size() - 1;
        scanPageIndex++;
        ScanResponse.Builder response = ScanResponse.builder().count(count);
        if (morePagesRemain) {
            response.lastEvaluatedKey(Map.of("sensor_type", AttributeValue.fromS("page-" + scanPageIndex)));
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
