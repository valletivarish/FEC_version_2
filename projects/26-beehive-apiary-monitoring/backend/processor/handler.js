"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { toItem } = require("./transform");

const TABLE_NAME = process.env.TABLE_NAME || "bam-readings";

let client;
function documentClient() {
  if (client) return client;
  const config = { region: process.env.AWS_REGION || "eu-west-1" };
  // Gate on the LocalStack-only endpoint override, not on AWS_ACCESS_KEY_ID:
  // real Lambda always injects that variable for its own execution-role
  // credentials, so branching on its presence would rebuild an incomplete
  // static credentials object (no session token) and break auth in
  // production instead of letting the SDK's default chain handle it.
  if (process.env.AWS_ENDPOINT_URL) {
    config.endpoint = process.env.AWS_ENDPOINT_URL;
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
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
// is one aggregated window from the fog gateway.
exports.handler = async (event) => {
  const written = await writeBatch(event.Records || [], documentClient(), TABLE_NAME);
  return { written };
};

exports.writeBatch = writeBatch;
