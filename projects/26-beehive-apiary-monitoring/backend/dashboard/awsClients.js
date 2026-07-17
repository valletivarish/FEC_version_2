"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { LambdaClient } = require("@aws-sdk/client-lambda");

function hiveSdkConfig() {
  const config = { region: process.env.AWS_REGION || "eu-west-1" };
  // Gotcha: gate on the LocalStack endpoint override, not AWS_ACCESS_KEY_ID (real Lambda injects that), or we shadow the SDK's own credential chain with a token-less static one.
  if (process.env.AWS_ENDPOINT_URL) {
    config.endpoint = process.env.AWS_ENDPOINT_URL;
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
  }
  return config;
}

function openHiveClients() {
  const config = hiveSdkConfig();
  return {
    doc: DynamoDBDocumentClient.from(new DynamoDBClient(config)),
    sqs: new SQSClient(config),
    lambda: new LambdaClient(config),
  };
}

module.exports = { openHiveClients, hiveSdkConfig };
