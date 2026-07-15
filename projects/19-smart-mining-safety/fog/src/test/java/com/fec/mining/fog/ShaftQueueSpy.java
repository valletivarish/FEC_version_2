package com.fec.mining.fog;

import software.amazon.awssdk.services.sqs.SqsAsyncClient;
import software.amazon.awssdk.services.sqs.model.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

class ShaftQueueSpy implements SqsAsyncClient {

    final List<SendMessageBatchRequest> batchRequests = new ArrayList<>();
    final List<SendMessageRequest> singleRequests = new ArrayList<>();
    private int queueUrlLookups = 0;

    @Override
    public CompletableFuture<GetQueueUrlResponse> getQueueUrl(GetQueueUrlRequest request) {
        queueUrlLookups++;
        return CompletableFuture.completedFuture(GetQueueUrlResponse.builder().queueUrl("http://queue-url").build());
    }

    @Override
    public CompletableFuture<GetQueueUrlResponse> getQueueUrl(Consumer<GetQueueUrlRequest.Builder> builder) {
        var b = GetQueueUrlRequest.builder();
        builder.accept(b);
        return getQueueUrl(b.build());
    }

    @Override
    public CompletableFuture<SendMessageResponse> sendMessage(SendMessageRequest request) {
        singleRequests.add(request);
        return CompletableFuture.completedFuture(SendMessageResponse.builder().messageId("m-" + singleRequests.size()).build());
    }

    @Override
    public CompletableFuture<SendMessageBatchResponse> sendMessageBatch(SendMessageBatchRequest request) {
        batchRequests.add(request);
        return CompletableFuture.completedFuture(SendMessageBatchResponse.builder().build());
    }

    int queueUrlLookups() {
        return queueUrlLookups;
    }

    @Override
    public String serviceName() {
        return "sqs";
    }

    @Override
    public void close() {
    }
}
