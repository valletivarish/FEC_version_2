"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { toHiveReadingItem } = require("./transform");

const TABLE_NAME = process.env.TABLE_NAME || "bam-readings";

let cachedApiaryDoc;
function apiaryDocClient() {
  if (cachedApiaryDoc) return cachedApiaryDoc;
  const docConfig = { region: process.env.AWS_REGION || "eu-west-1" };
  // Gate on the LocalStack-only endpoint, not AWS_ACCESS_KEY_ID: real Lambda always injects that variable, so branching on it would break execution-role auth.
  if (process.env.AWS_ENDPOINT_URL) {
    docConfig.endpoint = process.env.AWS_ENDPOINT_URL;
    docConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
  }
  cachedApiaryDoc = DynamoDBDocumentClient.from(new DynamoDBClient(docConfig));
  return cachedApiaryDoc;
}

async function persistHiveWindows(windows, apiaryDoc, readingsTable) {
  let storedCount = 0;
  for (const window of windows) {
    await apiaryDoc.send(new PutCommand({ TableName: readingsTable, Item: toHiveReadingItem(window.body) }));
    storedCount += 1;
  }
  return storedCount;
}

exports.handler = async (event) => {
  const storedCount = await persistHiveWindows(event.Records || [], apiaryDocClient(), TABLE_NAME);
  return { written: storedCount };
};

exports.persistHiveWindows = persistHiveWindows;
