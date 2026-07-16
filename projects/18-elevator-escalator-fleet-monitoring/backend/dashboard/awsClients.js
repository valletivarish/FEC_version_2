"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { LambdaClient } = require("@aws-sdk/client-lambda");

// Static credentials are only meaningful against LocalStack, so they're
// gated on the LocalStack-only AWS_ENDPOINT_URL signal rather than on
// AWS_ACCESS_KEY_ID's mere presence -- a real Lambda's execution role always
// injects AWS_ACCESS_KEY_ID (plus AWS_SECRET_ACCESS_KEY and
// AWS_SESSION_TOKEN) for its own temporary credentials, so gating on that
// variable alone would rebuild an incomplete, session-token-less credential
// object in production instead of leaving the SDK's default provider chain
// in charge.
function baseConfig() {
  const config = { region: process.env.AWS_REGION || "eu-west-1" };
  if (process.env.AWS_ENDPOINT_URL) {
    config.endpoint = process.env.AWS_ENDPOINT_URL;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  return config;
}

function buildClients() {
  const config = baseConfig();
  return {
    doc: DynamoDBDocumentClient.from(new DynamoDBClient(config)),
    sqs: new SQSClient(config),
    lambda: new LambdaClient(config),
  };
}

module.exports = { buildClients, baseConfig };
