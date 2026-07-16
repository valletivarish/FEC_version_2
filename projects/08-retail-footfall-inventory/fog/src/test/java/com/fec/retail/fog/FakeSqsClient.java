package com.fec.retail.fog;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchResponse;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageResponse;

import java.util.ArrayList;
import java.util.List;

public class FakeSqsClient implements SqsClient {

    final List<SendMessageRequest> singleSends = new ArrayList<>();
    final List<SendMessageBatchRequest> batchSends = new ArrayList<>();

    @Override
    public SendMessageResponse sendMessage(SendMessageRequest request) {
        singleSends.add(request);
        return SendMessageResponse.builder().messageId("m-" + singleSends.size()).build();
    }

    @Override
    public SendMessageBatchResponse sendMessageBatch(SendMessageBatchRequest request) {
        batchSends.add(request);
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
