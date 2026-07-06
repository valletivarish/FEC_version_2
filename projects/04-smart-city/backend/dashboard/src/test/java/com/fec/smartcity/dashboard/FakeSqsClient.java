package com.fec.smartcity.dashboard;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.*;

import java.util.Map;
import java.util.function.Consumer;

public record FakeSqsClient(boolean reachable, Map<String, String> queueAttributes) implements SqsClient {

    public static FakeSqsClient reachable(Map<String, String> queueAttributes) {
        return new FakeSqsClient(true, queueAttributes);
    }

    public static FakeSqsClient unreachable() {
        return new FakeSqsClient(false, Map.of());
    }

    @Override
    public GetQueueUrlResponse getQueueUrl(Consumer<GetQueueUrlRequest.Builder> builder) {
        if (!reachable) throw new RuntimeException("no queue");
        return GetQueueUrlResponse.builder().queueUrl("http://queue-url").build();
    }

    @Override
    public GetQueueAttributesResponse getQueueAttributes(GetQueueAttributesRequest request) {
        return GetQueueAttributesResponse.builder().attributesWithStrings(queueAttributes).build();
    }

    @Override
    public String serviceName() {
        return "sqs";
    }

    @Override
    public void close() {
    }
}
