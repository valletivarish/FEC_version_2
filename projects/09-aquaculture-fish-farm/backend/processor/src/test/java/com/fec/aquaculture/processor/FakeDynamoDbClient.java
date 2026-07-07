package com.fec.aquaculture.processor;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Hand-written fake of the real AWS SDK v2 DynamoDbClient interface (no
 * Mockito, no LocalStack). Backed by a CopyOnWriteArrayList because
 * PondHandler.processRecords submits writes to several worker threads at
 * once -- a plain ArrayList would be a real race here, not just theoretical.
 */
public class FakeDynamoDbClient implements DynamoDbClient {

    public final List<PutItemRequest> puts = new CopyOnWriteArrayList<>();
    private final boolean rejectAll;
    private final Set<String> rejectSensorTypes;

    public FakeDynamoDbClient() {
        this(false, Set.of());
    }

    public FakeDynamoDbClient(boolean rejectAll) {
        this(rejectAll, Set.of());
    }

    public FakeDynamoDbClient(Set<String> rejectSensorTypes) {
        this(false, rejectSensorTypes);
    }

    private FakeDynamoDbClient(boolean rejectAll, Set<String> rejectSensorTypes) {
        this.rejectAll = rejectAll;
        this.rejectSensorTypes = rejectSensorTypes;
    }

    @Override
    public PutItemResponse putItem(PutItemRequest request) {
        if (rejectAll) throw new RuntimeException("simulated write failure");
        String sensorType = request.item().get("sensor_type").s();
        if (rejectSensorTypes.contains(sensorType)) {
            throw new RuntimeException("simulated write failure for " + sensorType);
        }
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
