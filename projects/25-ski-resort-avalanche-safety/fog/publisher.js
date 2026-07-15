"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

// An ES6 Proxy whose get trap lazily constructs and caches the SQSClient on first non-control property access -- the 7th distinct publisher shape among this portfolio's Node fog services.
const target = { client: null };

const config = { endpoint: undefined, region: "eu-west-1" };
let configured = false;
let queueUrlPromise = null;
let resolvedQueueUrl = null;

const BATCH_LIMIT = 10;

// Gated on config.endpoint (LocalStack only), not AWS_ACCESS_KEY_ID: Lambda
// injects that var for its own execution-role credentials, which would break
// if rebuilt here without a session token -- see awsClients.js/handler.js.
function buildRealClient() {
  const clientConfig = { endpoint: config.endpoint, region: config.region };
  if (config.endpoint) {
    clientConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
  }
  return new SQSClient(clientConfig);
}

// configure() nulls target.client so the next access rebuilds it with the new endpoint/region.
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

// Chunks at 10 entries per call because that's SQS's SendMessageBatch limit.
async function publishBatch(queueName, payloads, retries, delayMs) {
  if (!configured) throw new Error("publisher not configured -- call configure() or useClient() first");
  if (payloads.length === 0) return;
  const queueUrl = await resolveQueueUrl(queueName, retries, delayMs);
  const client = ensureClient();
  for (let offset = 0; offset < payloads.length; offset += BATCH_LIMIT) {
    const chunk = payloads.slice(offset, offset + BATCH_LIMIT);
    const entries = chunk.map((payload, i) => ({
      Id: String(offset + i),
      MessageBody: JSON.stringify(payload),
    }));
    await client.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }));
  }
}

// Checked before lazy client construction so configure/reset never forces a client to be built.
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
  // Test seam: injects a fake client instead of a real SQSClient.
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
  publishBatch,
};

const proxyPublisher = new Proxy(target, {
  get(t, prop) {
    if (prop === "queueUrl") return resolvedQueueUrl;
    if (Object.prototype.hasOwnProperty.call(CONTROL, prop)) return CONTROL[prop];
    // Lazy construction: first property read here builds and caches the real client.
    const client = ensureClient();
    if (prop === "send") return (...args) => client.send(...args);
    return client[prop];
  },
});

module.exports = proxyPublisher;
