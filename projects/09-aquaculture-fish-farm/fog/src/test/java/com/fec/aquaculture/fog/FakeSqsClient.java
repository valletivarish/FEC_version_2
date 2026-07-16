package com.fec.aquaculture.fog;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlResponse;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchResponse;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageResponse;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

class FakeSqsClient implements SqsClient {

    final List<Integer> batchSizes = new ArrayList<>();
    int singleSendCount = 0;
    int getQueueUrlCalls = 0;

    @Override
    public GetQueueUrlResponse getQueueUrl(Consumer<GetQueueUrlRequest.Builder> builder) {
        getQueueUrlCalls++;
        return GetQueueUrlResponse.builder().queueUrl("http://queue-url").build();
    }

    @Override
    public SendMessageResponse sendMessage(SendMessageRequest request) {
        singleSendCount++;
        return SendMessageResponse.builder().build();
    }

    @Override
    public SendMessageBatchResponse sendMessageBatch(SendMessageBatchRequest request) {
        batchSizes.add(request.entries().size());
        return SendMessageBatchResponse.builder().build();
    }

    @Override
    public String serviceName() {
        return "sqs";
    }

    @Override
    public void close() {
    }
}
