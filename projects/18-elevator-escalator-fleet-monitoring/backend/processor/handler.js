"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { toItem } = require("./transform");

const TABLE_NAME = process.env.TABLE_NAME || "eef-readings";

let client;
function documentClient() {
  if (client) return client;
  // Gated on the LocalStack-only AWS_ENDPOINT_URL signal, not on
  // AWS_ACCESS_KEY_ID's presence -- a real Lambda's execution role always
  // injects that variable (plus a session token) for its own temporary
  // credentials, so branching on it alone would rebuild an incomplete
  // credential object in production instead of deferring to the SDK's
  // default provider chain.
  const config = { region: process.env.AWS_REGION || "eu-west-1" };
  if (process.env.AWS_ENDPOINT_URL) {
    config.endpoint = process.env.AWS_ENDPOINT_URL;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  client = DynamoDBDocumentClient.from(new DynamoDBClient(config));
  return client;
}

async function writeBatch(records, doc, tableName) {
  let written = 0;
  for (const record of records) {
    await doc.send(new PutCommand({ TableName: tableName, Item: toItem(record.body) }));
    written += 1;
  }
  return written;
}

// SQS event-source-mapping invokes this per batch of messages; each record
// is one window-aggregate for one (sensor_type, site_id) pair.
exports.handler = async (event) => {
  const written = await writeBatch(event.Records || [], documentClient(), TABLE_NAME);
  return { written };
};

exports.writeBatch = writeBatch;
