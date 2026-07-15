package com.fec.warehouse.fog;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.*;

import java.util.ArrayList;
import java.util.List;

class RelaySqsSpy implements SqsClient {

    final List<SendMessageBatchRequest> batchRequests = new ArrayList<>();
    final List<SendMessageRequest> singleRequests = new ArrayList<>();

    @Override
    public GetQueueUrlResponse getQueueUrl(GetQueueUrlRequest request) {
        return GetQueueUrlResponse.builder().queueUrl("http://queue-url").build();
    }

    @Override
    public SendMessageResponse sendMessage(SendMessageRequest request) {
        singleRequests.add(request);
        return SendMessageResponse.builder().messageId("m-" + singleRequests.size()).build();
    }

    @Override
    public SendMessageBatchResponse sendMessageBatch(SendMessageBatchRequest request) {
        batchRequests.add(request);
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
