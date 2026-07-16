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

// A COUNT Scan only covers ~1MB of scanned data per call; DynamoDB signals
// a further page via LastEvaluatedKey, so a single call silently undercounts
// once the table outgrows one page. scanCountPages() hand-implements the
// async-iterator protocol (a plain object with [Symbol.asyncIterator], no
// generator function) so the paging state lives in a closure and the
// consumer is just a for-await sum.
function scanCountPages(doc, tableName) {
  let cursor;
  let exhausted = false;
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          if (exhausted) return Promise.resolve({ done: true, value: undefined });
          return doc
            .send(new ScanCommand({ TableName: tableName, Select: "COUNT", ExclusiveStartKey: cursor }))
            .then((page) => {
              cursor = page.LastEvaluatedKey;
              exhausted = cursor === undefined;
              return { done: false, value: page.Count };
            });
        },
      };
    },
  };
}

async function countTableItems(doc, tableName) {
  let total = 0;
  for await (const pageCount of scanCountPages(doc, tableName)) total += pageCount;
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
