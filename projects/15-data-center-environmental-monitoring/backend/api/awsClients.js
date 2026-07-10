"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { LambdaClient } = require("@aws-sdk/client-lambda");

function baseConfig() {
  const config = { region: process.env.AWS_REGION || "eu-west-1" };
  if (process.env.AWS_ENDPOINT_URL) config.endpoint = process.env.AWS_ENDPOINT_URL;
  if (process.env.AWS_ACCESS_KEY_ID) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
  }
  return config;
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
