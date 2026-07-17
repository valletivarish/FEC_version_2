"use strict";

const { GetQueueUrlCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const { GetFunctionCommand } = require("@aws-sdk/client-lambda");
const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

const HIVE_FRESH_WINDOW_SECONDS = 30;

async function combQueueReachable(sqs, queueName) {
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    await sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["QueueArn"] }));
    return true;
  } catch {
    return false;
  }
}

async function processorAlive(lambda, functionName) {
  try {
    const resp = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    return resp.Configuration.State === "Active";
  } catch {
    return false;
  }
}

async function readCombQueueDepth(sqs, queueName) {
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

// Gotcha: Scan(Select=COUNT) only counts one ~1MB page, so a larger table needs every page followed via LastEvaluatedKey.
async function* walkScanPages(doc, tableName) {
  let ExclusiveStartKey;
  do {
    const resp = await doc.send(new ScanCommand({ TableName: tableName, Select: "COUNT", ExclusiveStartKey }));
    yield resp.Count;
    ExclusiveStartKey = resp.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function tallyStoredReadings(doc, tableName) {
  let total = 0;
  for await (const pageCount of walkScanPages(doc, tableName)) {
    total += pageCount;
  }
  return total;
}

async function pingHiveGateway(healthUrl) {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

function nectarFlowing(freshestAge) {
  return freshestAge !== null && freshestAge <= HIVE_FRESH_WINDOW_SECONDS;
}

module.exports = {
  HIVE_FRESH_WINDOW_SECONDS,
  combQueueReachable,
  processorAlive,
  readCombQueueDepth,
  tallyStoredReadings,
  pingHiveGateway,
  nectarFlowing,
};
