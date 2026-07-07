package com.fec.warehouse.processor;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;

import java.util.ArrayList;
import java.util.List;

public class FakeDynamoDbClient implements DynamoDbClient {

    public final List<PutItemRequest> puts = new ArrayList<>();
    private final boolean rejectWrites;

    public FakeDynamoDbClient() {
        this(false);
    }

    public FakeDynamoDbClient(boolean rejectWrites) {
        this.rejectWrites = rejectWrites;
    }

    @Override
    public PutItemResponse putItem(PutItemRequest request) {
        if (rejectWrites) throw new RuntimeException("simulated write failure");
        puts.add(request);
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
