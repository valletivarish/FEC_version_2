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

async function countTableItems(doc, tableName) {
  try {
    let total = 0;
    let lastEvaluatedKey;
    do {
      const resp = await doc.send(new ScanCommand({
        TableName: tableName,
        Select: "COUNT",
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      total += resp.Count;
      lastEvaluatedKey = resp.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return total;
  } catch {
    return null;
  }
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
