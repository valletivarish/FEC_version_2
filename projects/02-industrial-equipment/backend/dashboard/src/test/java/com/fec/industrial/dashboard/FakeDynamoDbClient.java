package com.fec.industrial.dashboard;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;

import java.util.List;
import java.util.Map;

public class FakeDynamoDbClient implements DynamoDbClient {

    private final Map<String, List<Map<String, AttributeValue>>> itemsBySensorType;
    private final int scanCount;

    public FakeDynamoDbClient(Map<String, List<Map<String, AttributeValue>>> itemsBySensorType, int scanCount) {
        this.itemsBySensorType = itemsBySensorType;
        this.scanCount = scanCount;
    }

    @Override
    public QueryResponse query(QueryRequest request) {
        String sensorType = request.expressionAttributeValues().get(":st").s();
        List<Map<String, AttributeValue>> items = itemsBySensorType.getOrDefault(sensorType, List.of());
        return QueryResponse.builder().items(items).build();
    }

    @Override
    public ScanResponse scan(ScanRequest request) {
        return ScanResponse.builder().count(scanCount).build();
    }

    @Override
    public String serviceName() {
        return "dynamodb";
    }

    @Override
    public void close() {
    }
}
