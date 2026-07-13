"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// An ES6 Proxy whose get trap lazily constructs and caches the SQSClient on first non-control property access -- the 7th distinct publisher shape among this portfolio's Node fog services.
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
