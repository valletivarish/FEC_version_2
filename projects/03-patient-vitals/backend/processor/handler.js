"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { toRecord } = require("./transform");

const TABLE_NAME = process.env.TABLE_NAME || "fpv-readings";

let cachedClient;

function docClient() {
  if (!cachedClient) {
    const config = { region: process.env.AWS_REGION || "eu-west-1" };
    if (process.env.AWS_ENDPOINT_URL) {
      config.endpoint = process.env.AWS_ENDPOINT_URL;
      config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      };
    }
    cachedClient = DynamoDBDocumentClient.from(new DynamoDBClient(config));
  }
  return cachedClient;
}

async function processRecords(records, doc, tableName) {
  for (const record of records) {
    await doc.send(new PutCommand({ TableName: tableName, Item: toRecord(record.body) }));
  }
  return records.length;
}

exports.handler = async (event) => {
  const processed = await processRecords(event.Records, docClient(), TABLE_NAME);
  return { processed };
};

exports.processRecords = processRecords;
