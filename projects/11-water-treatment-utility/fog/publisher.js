"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// Module export is itself a single Object.freeze()'d gateway object (not a class instance, closure-factory, or param-passed stateless function) with a live `queueUrl` getter over closed-over private state -- the 4th distinct fog-publisher idiom in this portfolio.
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
