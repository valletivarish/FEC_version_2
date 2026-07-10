"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// Exposed as a single frozen object literal -- the module export itself IS
// the gateway, not a class you instantiate (03-patient-vitals'
// QueueGateway) and not a closure-factory that hands back a fresh
// { publish, queueUrl } object on every call (06-offshore-wind-farm's
// createPublisher). It is also not a stateless function taking the SQS
// client as a parameter on every call with an external Map cache
// (10-wildfire-forest-monitoring's publisher.js) -- here the client and the
// resolved queue URL are private state closed over by this module, and the
// public surface is a single Object.freeze()'d shape so callers cannot
// reassign gateway.publish or bolt on new methods at runtime. The one
// genuinely dynamic piece of that frozen shape, `queueUrl`, is a getter --
// freezing an object only locks down its own property descriptors, it does
// not prevent a getter from computing a fresh value from the private cache
// below on every read.
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
