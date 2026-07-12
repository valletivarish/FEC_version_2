"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// A JS Proxy-wrapped lazy client, not any of the six publisher shapes
// already used by this portfolio's other six Node fog services:
// 03-patient-vitals' QueueGateway is a class (constructor + init() +
// send()); 06-offshore-wind-farm's createPublisher() is a closure factory
// returning a fresh { publish, queueUrl } object per call;
// 10-wildfire-forest-monitoring's publish() is a bare exported function
// taking the SQS client as an explicit parameter every call, with a
// module-level Map cache for queue-url memoization; 11-water-treatment-
// utility's module.exports IS a single Object.freeze()'d object literal;
// 15-data-center-environmental-monitoring decouples flush from send via an
// EventEmitter "window-closed" listener that calls SendMessageBatchCommand;
// 18-elevator-escalator-fleet-monitoring wires a real
// stream.Transform/stream.Writable pipeline. None of the seven uses an ES6
// Proxy.
//
// `target` starts as a genuinely empty object literal with nothing built on
// it. The Proxy's get trap below is the ONLY place a real SQSClient is ever
// constructed: the first time any caller reads a property that is not one
// of the control methods (configure/useClient/reset/publish/queueUrl), the
// trap lazily builds the client (unless a fake was already injected via
// useClient) and caches it directly onto `target.client`, so every later
// property access reuses that same cached instance. This makes
// `publisher.send(...)` -- or any other property read -- transparently
// trigger lazy init on first use; nothing in this module calls
// `new SQSClient(...)` outside the trap.
const target = { client: null };

const config = { endpoint: undefined, region: "eu-west-1" };
let configured = false;
let queueUrlPromise = null;
let resolvedQueueUrl = null;

function buildRealClient() {
  return new SQSClient({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
}

// Shared by the get trap below and publish(): builds the real client (via
// buildRealClient) the first time it is actually needed, unless useClient()
// already injected one directly onto target.client. configure() deliberately
// nulls target.client out again (to pick up new endpoint/region on the next
// access), so "configured but not yet built" and "never configured at all"
// are two different states -- only the `configured` flag distinguishes them.
function ensureClient() {
  if (!target.client) target.client = buildRealClient();
  return target.client;
}

function resolveQueueUrl(queueName, retries = 30, delayMs = 2000) {
  if (queueUrlPromise) return queueUrlPromise;

  queueUrlPromise = (async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { QueueUrl } = await ensureClient().send(new GetQueueUrlCommand({ QueueName: queueName }));
        resolvedQueueUrl = QueueUrl;
        return QueueUrl;
      } catch (err) {
        if (attempt === retries) {
          queueUrlPromise = null;
          throw new Error(`queue ${queueName} not reachable: ${err.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return undefined;
  })();

  return queueUrlPromise;
}

async function publish(queueName, payload, retries, delayMs) {
  if (!configured) throw new Error("publisher not configured -- call configure() or useClient() first");
  const queueUrl = await resolveQueueUrl(queueName, retries, delayMs);
  await ensureClient().send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(payload) }));
}

// Control methods intercepted directly by the get trap before any lazy
// client construction happens, so configuring/resetting the publisher never
// forces a client to be built ahead of actual use.
const CONTROL = {
  configure(endpoint, region) {
    config.endpoint = endpoint;
    config.region = region || config.region;
    target.client = null;
    configured = true;
    queueUrlPromise = null;
    resolvedQueueUrl = null;
    return proxyPublisher;
  },
  // Test seam: inject a hand-written fake client ({ send: async (cmd) => ... })
  // instead of a real SQSClient, still exercised through the same lazy trap.
  useClient(client) {
    target.client = client;
    configured = true;
    queueUrlPromise = null;
    resolvedQueueUrl = null;
    return proxyPublisher;
  },
  reset() {
    target.client = null;
    configured = false;
    queueUrlPromise = null;
    resolvedQueueUrl = null;
  },
  publish,
};

const proxyPublisher = new Proxy(target, {
  get(t, prop) {
    if (prop === "queueUrl") return resolvedQueueUrl;
    if (Object.prototype.hasOwnProperty.call(CONTROL, prop)) return CONTROL[prop];
    // Lazy construction: the first property read that reaches this point
    // (e.g. `.send`) builds and caches the real client via ensureClient() if
    // nothing has configured or injected one yet.
    const client = ensureClient();
    if (prop === "send") return (...args) => client.send(...args);
    return client[prop];
  },
});

module.exports = proxyPublisher;
