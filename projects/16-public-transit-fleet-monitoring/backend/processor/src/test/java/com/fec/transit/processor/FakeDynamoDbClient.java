package com.fec.transit.processor;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;

import java.util.ArrayList;
import java.util.List;

/** Hand-written fake of the real AWS SDK v2 DynamoDbClient interface (no Mockito, no LocalStack). */
class FakeDynamoDbClient implements DynamoDbClient {

    final List<PutItemRequest> puts = new ArrayList<>();
    private final boolean rejectAll;

    FakeDynamoDbClient() {
        this(false);
    }

    FakeDynamoDbClient(boolean rejectAll) {
        this.rejectAll = rejectAll;
    }

    @Override
    public PutItemResponse putItem(PutItemRequest request) {
        if (rejectAll) throw new RuntimeException("simulated write failure");
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
