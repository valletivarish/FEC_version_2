"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// SQS dispatch as a Node async generator -- the only publisher shape in this
// portfolio that is a generator. Every sibling fog service publishes
// through something else: 03-patient-vitals' QueueGateway is a class
// (constructor + init() + send()); 06-offshore-wind-farm's createPublisher()
// is a closure factory returning a fresh { publish, queueUrl } object per
// call; 10-wildfire-forest-monitoring's publish() is a bare exported
// function taking the SQS client as an explicit parameter every call, with
// a module-level Map cache for queue-url memoization; 11-water-treatment-
// utility's module.exports IS a single Object.freeze()'d object literal;
// 15-data-center-environmental-monitoring decouples flush from send via an
// EventEmitter "window-closed" listener that calls
// SendMessageBatchCommand; 18-elevator-escalator-fleet-monitoring wires a
// real Node stream.Transform/stream.Writable pipeline; and 22-smart-waste-
// management runs a self-draining async FIFO work queue with an internal
// "pump" loop.
//
// publishBatches(queueName, payloads) below is `async function*` -- callers
// consume it with `for await (const result of publishBatches(...))`. The
// generator body awaits each SQS send before it yields that send's result,
// so the loop gives natural backpressure for free: the next payload in
// `payloads` is not even looked at until the caller has pulled the previous
// yielded result out of the generator with its own iteration step. There is
// no separate queue, no buffer, no pump function -- the generator's own
// suspended state between yields IS the backpressure mechanism.
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
