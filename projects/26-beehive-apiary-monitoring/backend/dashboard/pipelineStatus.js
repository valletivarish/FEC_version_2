"use strict";

const { GetQueueUrlCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const { GetFunctionCommand } = require("@aws-sdk/client-lambda");
const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

const PIPELINE_FRESH_SECONDS = 30;

async function isQueueReachable(sqs, queueName) {
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    await sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["QueueArn"] }));
    return true;
  } catch {
    return false;
  }
}

async function isLambdaActive(lambda, functionName) {
  try {
    const resp = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    return resp.Configuration.State === "Active";
  } catch {
    return false;
  }
}

async function readQueueCounters(sqs, queueName) {
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    const { Attributes } = await sqs.send(new GetQueueAttributesCommand({
      QueueUrl,
      AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
    }));
    return {
      waiting: parseInt(Attributes.ApproximateNumberOfMessages, 10),
      in_flight: parseInt(Attributes.ApproximateNumberOfMessagesNotVisible, 10),
    };
  } catch {
    return null;
  }
}

// Scan(Select=COUNT) only counts the items on one ~1MB response page; a
// table past that size needs every page followed via LastEvaluatedKey. This
// walks pages as an async generator (the same idiom fog/publisher.js uses
// for its SQS dispatch), yielding each page's own Count, summed by the
// for-await loop below.
async function* scanCountPages(doc, tableName) {
  let ExclusiveStartKey;
  do {
    const resp = await doc.send(new ScanCommand({ TableName: tableName, Select: "COUNT", ExclusiveStartKey }));
    yield resp.Count;
    ExclusiveStartKey = resp.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function countTableItems(doc, tableName) {
  let total = 0;
  for await (const pageCount of scanCountPages(doc, tableName)) {
    total += pageCount;
  }
  return total;
}

async function checkGateway(healthUrl) {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

function isPipelineFlowing(freshestAge) {
  return freshestAge !== null && freshestAge <= PIPELINE_FRESH_SECONDS;
}

module.exports = {
  PIPELINE_FRESH_SECONDS,
  isQueueReachable,
  isLambdaActive,
  readQueueCounters,
  countTableItems,
  checkGateway,
  isPipelineFlowing,
};
