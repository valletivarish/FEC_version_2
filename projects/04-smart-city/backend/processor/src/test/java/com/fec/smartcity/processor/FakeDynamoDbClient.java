package com.fec.smartcity.processor;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;

import java.util.ArrayList;
import java.util.List;

public record FakeDynamoDbClient(List<PutItemRequest> recordedPuts) implements DynamoDbClient {

    public static FakeDynamoDbClient recording() {
        return new FakeDynamoDbClient(new ArrayList<>());
    }

    public List<PutItemRequest> puts() {
        return recordedPuts;
    }

    @Override
    public PutItemResponse putItem(PutItemRequest request) {
        recordedPuts.add(request);
        return PutItemResponse.builder().build();
    }

    @Override
    public String serviceName() {
        return "dynamodb";
    }

    @Override
    public void close() {
    }
}
