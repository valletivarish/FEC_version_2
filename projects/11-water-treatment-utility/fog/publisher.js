"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

let _sqsClient = null;
let _urlLookup = null;
let _cachedQueueUrl = null;

const MAX_BATCH_ENTRIES = 10;

function openGateway(endpoint, region) {
  // Static test/test creds only for LocalStack; real deployments use the SDK default chain.
  const config = { region };
  if (endpoint) {
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  _sqsClient = new SQSClient(config);
  _urlLookup = null;
  _cachedQueueUrl = null;
  return plantQueueGateway;
}

function attachClient(client) {
  _sqsClient = client;
  _urlLookup = null;
  _cachedQueueUrl = null;
  return plantQueueGateway;
}

function lookupQueueUrl(queueName, retries = 30, delayMs = 2000) {
  if (_urlLookup) return _urlLookup;

  _urlLookup = (async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { QueueUrl } = await _sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
        _cachedQueueUrl = QueueUrl;
        return QueueUrl;
      } catch (err) {
        if (attempt === retries) {
          _urlLookup = null;
          throw new Error(`queue ${queueName} not reachable: ${err.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return undefined;
  })();

  return _urlLookup;
}

async function sendOne(queueName, payload, retries, delayMs) {
  if (!_sqsClient) throw new Error("publisher gateway not configured -- call openGateway() or attachClient() first");
  const queueUrl = await lookupQueueUrl(queueName, retries, delayMs);
  await _sqsClient.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(payload) }));
}

// SendMessageBatch caps at ten entries per call; returns the number of batch calls made.
async function sendWindow(queueName, payloads, retries, delayMs) {
  if (!_sqsClient) throw new Error("publisher gateway not configured -- call openGateway() or attachClient() first");
  if (!payloads.length) return 0;
  const queueUrl = await lookupQueueUrl(queueName, retries, delayMs);
  let calls = 0;
  for (let start = 0; start < payloads.length; start += MAX_BATCH_ENTRIES) {
    const entries = payloads.slice(start, start + MAX_BATCH_ENTRIES).map((payload, offset) => ({
      Id: String(start + offset),
      MessageBody: JSON.stringify(payload),
    }));
    await _sqsClient.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }));
    calls += 1;
  }
  return calls;
}

function clearGateway() {
  _sqsClient = null;
  _urlLookup = null;
  _cachedQueueUrl = null;
}

const plantQueueGateway = Object.freeze({
  openGateway,
  attachClient,
  sendOne,
  sendWindow,
  clearGateway,
  // A getter, so a frozen object still reflects the current cached value.
  get queueEndpoint() {
    return _cachedQueueUrl;
  },
});

module.exports = plantQueueGateway;
