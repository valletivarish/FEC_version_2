"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { LambdaClient } = require("@aws-sdk/client-lambda");

function baseConfig() {
  const config = { region: process.env.AWS_REGION || "eu-west-1" };
  if (process.env.AWS_ENDPOINT_URL) {
    config.endpoint = process.env.AWS_ENDPOINT_URL;
    // LocalStack accepts any static credentials; real AWS issues temporary
    // ones (session token required) via the execution role, so this
    // override must not apply outside the LocalStack case.
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
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
