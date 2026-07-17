"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { windowToReadingItem } = require("./transform");

const TABLE_NAME = process.env.TABLE_NAME || "wtu-readings";

let cachedWriterClient;
function readingsWriterClient() {
  if (cachedWriterClient) return cachedWriterClient;
  const clientOptions = { region: process.env.AWS_REGION || "eu-west-1" };
  // Gate on AWS_ENDPOINT_URL, not AWS_ACCESS_KEY_ID: Lambda always sets the latter, so gating on it would drop the role's session token.
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

exports.handler = async (event) => {
  const storedCount = await persistWindowBatch(event.Records || [], readingsWriterClient(), TABLE_NAME);
  return { written: storedCount };
};

exports.persistWindowBatch = persistWindowBatch;
