"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// SQS dispatch as an `async function*` generator -- the only generator-shaped publisher in this portfolio; its suspended state between yields IS the backpressure, with no separate queue/buffer/pump.
let _client = null;
let _queueUrlPromise = null;
let _resolvedQueueUrl = null;

function configure(endpoint, region) {
  _client = new SQSClient({
    endpoint,
    region,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
}

// Test seam: inject a hand-written fake client ({ send: async (cmd) => ... })
// instead of a real SQSClient.
function useClient(client) {
  _client = client;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
}

function resolveQueueUrl(queueName, retries = 30, delayMs = 2000) {
  if (_queueUrlPromise) return _queueUrlPromise;

  _queueUrlPromise = (async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { QueueUrl } = await _client.send(new GetQueueUrlCommand({ QueueName: queueName }));
        _resolvedQueueUrl = QueueUrl;
        return QueueUrl;
      } catch (err) {
        if (attempt === retries) {
          _queueUrlPromise = null;
          throw new Error(`queue ${queueName} not reachable: ${err.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return undefined;
  })();

  return _queueUrlPromise;
}

// The sole publish path in this service. Each iteration awaits a real
// SendMessageCommand before yielding { payload, sent: true } for that
// payload -- a send that rejects propagates out of the generator at that
// exact point (the caller's for-await loop observes the rejection), rather
// than being swallowed into a per-item failure marker, so callers decide
// their own retry/log strategy at the call site.
async function* publishBatches(queueName, payloads, retries, delayMs) {
  if (!_client) throw new Error("publisher not configured -- call configure() or useClient() first");
  const queueUrl = await resolveQueueUrl(queueName, retries, delayMs);
  for (const payload of payloads) {
    await _client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(payload) }));
    yield { payload, sent: true };
  }
}

function getQueueUrl() {
  return _resolvedQueueUrl;
}

// Test seam: drop the cached client/queue-url so each test file starts from
// a clean slate.
function reset() {
  _client = null;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
}

module.exports = { configure, useClient, publishBatches, getQueueUrl, reset };
