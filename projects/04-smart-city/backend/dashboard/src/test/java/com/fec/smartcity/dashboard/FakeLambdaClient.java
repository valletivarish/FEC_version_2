package com.fec.smartcity.dashboard;

import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration;
import software.amazon.awssdk.services.lambda.model.GetFunctionRequest;
import software.amazon.awssdk.services.lambda.model.GetFunctionResponse;
import software.amazon.awssdk.services.lambda.model.State;

public record FakeLambdaClient(boolean deployed, State currentState) implements LambdaClient {

    public static FakeLambdaClient inState(State currentState) {
        return new FakeLambdaClient(true, currentState);
    }

    public static FakeLambdaClient notDeployed() {
        return new FakeLambdaClient(false, State.PENDING);
    }

    @Override
    public GetFunctionResponse getFunction(GetFunctionRequest request) {
        if (!deployed) throw new RuntimeException("function not found");
        return GetFunctionResponse.builder()
            .configuration(FunctionConfiguration.builder().state(currentState).build())
            .build();
    }

    @Override
    public String serviceName() {
        return "lambda";
    }

    @Override
    public void close() {
    }
}
