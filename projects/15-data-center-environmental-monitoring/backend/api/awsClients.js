"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { LambdaClient } = require("@aws-sdk/client-lambda");

// AWS_ACCESS_KEY_ID is always present in a real Lambda execution
// environment too (populated automatically with genuine, temporary,
// session-token-bearing credentials), so it cannot be the signal for
// "we're pointed at the local emulator" -- only AWS_ENDPOINT_URL is unique
// to that case, and dummy credentials are only ever valid alongside it.
function baseConfig() {
  const localEndpoint = process.env.AWS_ENDPOINT_URL;
  return {
    region: process.env.AWS_REGION || "eu-west-1",
    ...(localEndpoint && { endpoint: localEndpoint }),
    ...(localEndpoint && { credentials: { accessKeyId: "test", secretAccessKey: "test" } }),
  };
}

// This Lambda (dce-api) is invoked directly by API Gateway per request, so
// clients are built lazily and cached in module scope for the lifetime of
// the execution environment, the same pattern backend/processor/handler.js
// uses for its DynamoDB client.
function buildClients() {
  const config = baseConfig();
  return {
    doc: DynamoDBDocumentClient.from(new DynamoDBClient(config)),
    sqs: new SQSClient(config),
    lambda: new LambdaClient(config),
  };
}

module.exports = { buildClients, baseConfig };
