"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { toItem } = require("./transform");

const TABLE_NAME = process.env.TABLE_NAME || "dce-readings";

let client;
function documentClient() {
  if (client) return client;
  const config = { region: process.env.AWS_REGION || "eu-west-1" };
  // A real Lambda execution environment always populates AWS_ACCESS_KEY_ID
  // with genuine, session-token-bearing temporary credentials, so keying
  // off that variable's mere presence would wrongly pin this client to a
  // dummy static pair on every real deployment too. AWS_ENDPOINT_URL is
  // the one variable that is only ever set when pointing at the local
  // emulator, so both the endpoint override and the dummy credentials are
  // gated on it together.
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
// is one aggregated hall/sensor window from the fog gateway.
exports.handler = async (event) => {
  const written = await writeBatch(event.Records || [], documentClient(), TABLE_NAME);
  return { written };
};

exports.writeBatch = writeBatch;
