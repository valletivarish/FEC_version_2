"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { windowToReadingItem } = require("./transform");

const TABLE_NAME = process.env.TABLE_NAME || "wtu-readings";

let cachedWriterClient;
function readingsWriterClient() {
  if (cachedWriterClient) return cachedWriterClient;
  const clientOptions = { region: process.env.AWS_REGION || "eu-west-1" };
  // Gate on AWS_ENDPOINT_URL (LocalStack-only), not AWS_ACCESS_KEY_ID: real
  // Lambda always sets AWS_ACCESS_KEY_ID for its own execution-role
  // credentials, so gating on its presence would rebuild a static
  // credential object missing the role's session token and break real
  // DynamoDB authentication.
  if (process.env.AWS_ENDPOINT_URL) {
    clientOptions.endpoint = process.env.AWS_ENDPOINT_URL;
    clientOptions.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
  }
  cachedWriterClient = DynamoDBDocumentClient.from(new DynamoDBClient(clientOptions));
  return cachedWriterClient;
}

async function persistWindowBatch(windows, doc, tableName) {
  let storedCount = 0;
  for (const window of windows) {
    await doc.send(new PutCommand({ TableName: tableName, Item: windowToReadingItem(window.body) }));
    storedCount += 1;
  }
  return storedCount;
}

// SQS event-source-mapping invokes this per batch of messages; each record
// is one aggregated window from the fog gateway.
exports.handler = async (event) => {
  const storedCount = await persistWindowBatch(event.Records || [], readingsWriterClient(), TABLE_NAME);
  return { written: storedCount };
};

exports.persistWindowBatch = persistWindowBatch;
