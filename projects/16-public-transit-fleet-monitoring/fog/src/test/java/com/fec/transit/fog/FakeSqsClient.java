package com.fec.transit.fog;

import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlRequest;
import software.amazon.awssdk.services.sqs.model.GetQueueUrlResponse;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequest;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchResponse;

import java.util.ArrayList;
import java.util.List;

/** Records every sendMessageBatch() call's entry count instead of talking to real SQS, so TransitPublisherTest can assert on chunking directly. */
class FakeSqsClient implements SqsClient {

    final List<Integer> batchSizes = new ArrayList<>();

    @Override
    public GetQueueUrlResponse getQueueUrl(GetQueueUrlRequest request) {
        return GetQueueUrlResponse.builder().queueUrl("http://queue-url").build();
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
