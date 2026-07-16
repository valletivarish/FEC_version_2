"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

// SQS dispatch as an `async function*` generator -- the only generator-shaped publisher in this portfolio; its suspended state between yields IS the backpressure, with no separate queue/buffer/pump.
const BATCH_LIMIT = 10; // SendMessageBatch's own per-call entry cap

let _client = null;
let _queueUrlPromise = null;
let _resolvedQueueUrl = null;

function configure(endpoint, region) {
  const config = { region };
  // Static test/test credentials only make sense against LocalStack, whose
  // presence is signalled by an explicit endpoint override; outside that,
  // leave credentials unset so the SDK falls back to its own default chain
  // (EC2/Lambda execution-role credentials in a real deployment).
  if (endpoint) {
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  _client = new SQSClient(config);
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

function chunkPayloads(payloads, size) {
  const chunks = [];
  for (let i = 0; i < payloads.length; i += size) {
    chunks.push(payloads.slice(i, i + size));
  }
  return chunks;
}

// Real batch dispatch: one SendMessageBatchCommand per up-to-BATCH_LIMIT
// group of payloads (the API's own cap) instead of one SendMessageCommand
// per payload. Kept as its own async generator so callers keep the same
// for-await/backpressure shape as publishBatches above -- the difference is
// that each network round trip now covers a whole batch, so the generator
// suspends between batches rather than between individual messages. A
// non-empty Failed array on the response is treated the same way a rejected
// send is treated above: thrown out of the generator rather than folded
// into a per-item marker.
async function* publishBatch(queueName, payloads, retries, delayMs) {
  if (!_client) throw new Error("publisher not configured -- call configure() or useClient() first");
  const queueUrl = await resolveQueueUrl(queueName, retries, delayMs);
  for (const group of chunkPayloads(payloads, BATCH_LIMIT)) {
    const Entries = group.map((payload, idx) => ({ Id: String(idx), MessageBody: JSON.stringify(payload) }));
    const resp = await _client.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries }));
    const failed = (resp && resp.Failed) || [];
    if (failed.length > 0) {
      throw new Error(`batch send failed for ${failed.length} of ${group.length} entries: ${failed.map((f) => f.Message || f.Code).join("; ")}`);
    }
    for (const payload of group) {
      yield { payload, sent: true };
    }
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

module.exports = { configure, useClient, publishBatches, publishBatch, getQueueUrl, reset };
