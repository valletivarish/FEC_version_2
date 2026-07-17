"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

// Module export is itself a single Object.freeze()'d gateway object (not a class instance, closure-factory, or param-passed stateless function) with a live `queueEndpoint` getter over closed-over private state -- the 4th distinct fog-publisher idiom in this portfolio.
let _sqsClient = null;
let _urlLookup = null;
let _cachedQueueUrl = null;

const MAX_BATCH_ENTRIES = 10;

function openGateway(endpoint, region) {
  // The static test/test pair is a LocalStack convention, so it only
  // applies when an explicit emulator endpoint is configured. Outside
  // LocalStack (a real EC2/Lambda deployment) endpoint is undefined and the
  // SDK's default credential chain supplies real credentials instead --
  // building the static provider unconditionally would misauthenticate
  // every real SQS call.
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

// Test seam: inject a hand-written fake client ({ send: async (cmd) => ... })
// instead of a real SQSClient.
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

// SendMessageBatch accepts at most ten entries per call, so a whole flush
// window's aggregates go out in ceil(n/10) batch calls instead of one
// SendMessage per aggregate. Returns the number of batch calls made.
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

// Test seam: drop the cached client/queue-url so each test file starts from
// a clean slate.
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
  // Deliberately a getter rather than a stored value: freezing this object
  // locks its property descriptors, not the value a getter computes, so
  // reads always reflect the current private cache above (null until the
  // first successful queue-url lookup resolves).
  get queueEndpoint() {
    return _cachedQueueUrl;
  },
});

module.exports = plantQueueGateway;
