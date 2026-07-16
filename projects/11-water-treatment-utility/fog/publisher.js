"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

// Module export is itself a single Object.freeze()'d gateway object (not a class instance, closure-factory, or param-passed stateless function) with a live `queueUrl` getter over closed-over private state -- the 4th distinct fog-publisher idiom in this portfolio.
let _client = null;
let _queueUrlPromise = null;
let _resolvedQueueUrl = null;

const BATCH_LIMIT = 10;

function configure(endpoint, region) {
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
  _client = new SQSClient(config);
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
  return gateway;
}

// Test seam: inject a hand-written fake client ({ send: async (cmd) => ... })
// instead of a real SQSClient.
function useClient(client) {
  _client = client;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
  return gateway;
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

async function publish(queueName, payload, retries, delayMs) {
  if (!_client) throw new Error("publisher gateway not configured -- call configure() or useClient() first");
  const queueUrl = await resolveQueueUrl(queueName, retries, delayMs);
  await _client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(payload) }));
}

// SendMessageBatch accepts at most ten entries per call, so a whole flush
// window's aggregates go out in ceil(n/10) batch calls instead of one
// SendMessage per aggregate. Returns the number of batch calls made.
async function publishBatch(queueName, payloads, retries, delayMs) {
  if (!_client) throw new Error("publisher gateway not configured -- call configure() or useClient() first");
  if (!payloads.length) return 0;
  const queueUrl = await resolveQueueUrl(queueName, retries, delayMs);
  let calls = 0;
  for (let start = 0; start < payloads.length; start += BATCH_LIMIT) {
    const entries = payloads.slice(start, start + BATCH_LIMIT).map((payload, offset) => ({
      Id: String(start + offset),
      MessageBody: JSON.stringify(payload),
    }));
    await _client.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }));
    calls += 1;
  }
  return calls;
}

// Test seam: drop the cached client/queue-url so each test file starts from
// a clean slate, mirroring the reset hooks used by the sibling projects'
// publisher tests.
function reset() {
  _client = null;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
}

const gateway = Object.freeze({
  configure,
  useClient,
  publish,
  publishBatch,
  reset,
  // Deliberately a getter rather than a stored value: freezing this object
  // locks its property descriptors, not the value a getter computes, so
  // reads always reflect the current private cache above (null until the
  // first successful queue-url lookup resolves).
  get queueUrl() {
    return _resolvedQueueUrl;
  },
});

module.exports = gateway;
