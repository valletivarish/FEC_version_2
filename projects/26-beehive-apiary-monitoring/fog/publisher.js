"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

const BATCH_ENTRY_CAP = 10; // SendMessageBatch's own per-call entry cap

let _sqsClient = null;
let _queueUrlLookup = null;
let _cachedQueueUrl = null;

function configureGateway(endpoint, region) {
  const config = { region };
  // Static test/test credentials only make sense against LocalStack, signalled by an explicit endpoint override; otherwise let the SDK's default chain supply execution-role credentials.
  if (endpoint) {
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  _sqsClient = new SQSClient(config);
  _queueUrlLookup = null;
  _cachedQueueUrl = null;
}

// Test seam: inject a hand-written fake client.
function injectClient(client) {
  _sqsClient = client;
  _queueUrlLookup = null;
  _cachedQueueUrl = null;
}

function lookupQueueUrl(queueName, retries = 30, delayMs = 2000) {
  if (_queueUrlLookup) return _queueUrlLookup;

  _queueUrlLookup = (async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { QueueUrl } = await _sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
        _cachedQueueUrl = QueueUrl;
        return QueueUrl;
      } catch (err) {
        if (attempt === retries) {
          _queueUrlLookup = null;
          throw new Error(`queue ${queueName} not reachable: ${err.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return undefined;
  })();

  return _queueUrlLookup;
}

// One SendMessage per payload; a rejected send propagates out of the generator to the caller's for-await loop rather than becoming a per-item failure marker.
async function* streamHiveSends(queueName, payloads, retries, delayMs) {
  if (!_sqsClient) throw new Error("publisher not configured -- call configureGateway() or injectClient() first");
  const queueUrl = await lookupQueueUrl(queueName, retries, delayMs);
  for (const payload of payloads) {
    await _sqsClient.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(payload) }));
    yield { payload, sent: true };
  }
}

function chunkHivePayloads(payloads, size) {
  const chunks = [];
  for (let i = 0; i < payloads.length; i += size) {
    chunks.push(payloads.slice(i, i + size));
  }
  return chunks;
}

// One SendMessageBatch per up-to-BATCH_ENTRY_CAP group; a non-empty Failed array is thrown out of the generator, not folded into a per-item marker.
async function* dispatchHiveBatches(queueName, payloads, retries, delayMs) {
  if (!_sqsClient) throw new Error("publisher not configured -- call configureGateway() or injectClient() first");
  const queueUrl = await lookupQueueUrl(queueName, retries, delayMs);
  for (const group of chunkHivePayloads(payloads, BATCH_ENTRY_CAP)) {
    const Entries = group.map((payload, idx) => ({ Id: String(idx), MessageBody: JSON.stringify(payload) }));
    const resp = await _sqsClient.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries }));
    const failed = (resp && resp.Failed) || [];
    if (failed.length > 0) {
      throw new Error(`batch send failed for ${failed.length} of ${group.length} entries: ${failed.map((f) => f.Message || f.Code).join("; ")}`);
    }
    for (const payload of group) {
      yield { payload, sent: true };
    }
  }
}

function currentQueueUrl() {
  return _cachedQueueUrl;
}

// Test seam: drop the cached client/queue-url so each test file starts clean.
function resetGateway() {
  _sqsClient = null;
  _queueUrlLookup = null;
  _cachedQueueUrl = null;
}

module.exports = { configureGateway, injectClient, streamHiveSends, dispatchHiveBatches, currentQueueUrl, resetGateway };
