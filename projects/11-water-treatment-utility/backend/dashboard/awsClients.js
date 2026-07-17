"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { LambdaClient } = require("@aws-sdk/client-lambda");

function sdkConnectionSettings() {
  const settings = { region: process.env.AWS_REGION || "eu-west-1" };
  // Gate on AWS_ENDPOINT_URL (LocalStack-only), not AWS_ACCESS_KEY_ID, which real Lambda also injects.
  if (process.env.AWS_ENDPOINT_URL) {
    settings.endpoint = process.env.AWS_ENDPOINT_URL;
    settings.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
  }
  return settings;
}

function openAwsClients() {
  const settings = sdkConnectionSettings();
  return {
    doc: DynamoDBDocumentClient.from(new DynamoDBClient(settings)),
    sqs: new SQSClient(settings),
    lambda: new LambdaClient(settings),
  };
}

module.exports = { openAwsClients, sdkConnectionSettings };
