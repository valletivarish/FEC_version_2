"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

// No class (03's QueueGateway) and no closure-factory holding client/queueUrl
// in a returned object (06's createPublisher). Just a plain function that
// takes the SQS client as a parameter on every call. The only piece of
// state worth keeping across calls is the resolved queue URL lookup itself
// (repeating GetQueueUrlCommand on every publish would be wasteful), so that
// one lookup is memoized behind a module-level Promise cache keyed by queue
// name -- deliberately not a stateful object/class, just a plain Map guarding
// against duplicate concurrent lookups for the same name.
const queueUrlCache = new Map();

function resolveQueueUrl(client, queueName, retries = 30, delayMs = 2000) {
  if (queueUrlCache.has(queueName)) return queueUrlCache.get(queueName);

  const lookup = (async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { QueueUrl } = await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
        return QueueUrl;
      } catch (err) {
        if (attempt === retries) {
          queueUrlCache.delete(queueName);
          throw new Error(`queue ${queueName} not reachable: ${err.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  })();

  queueUrlCache.set(queueName, lookup);
  return lookup;
}

function buildClient(endpoint, region) {
  // The static test/test pair is a LocalStack convention, so it is only
  // attached when an explicit emulator endpoint is configured. Without one
  // (a real deployment) the SDK's default chain supplies the EC2 instance
  // profile's credentials instead.
  const config = { region };
  if (endpoint) {
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  return new SQSClient(config);
}

// The single exported operation: publish one message. Every call receives
// the client explicitly rather than reaching into module-scope state, which
// is what makes this "just a function" rather than an object wrapping a
// connection.
async function publish(sqsClient, queueName, payload, retries, delayMs) {
  const queueUrl = await resolveQueueUrl(sqsClient, queueName, retries, delayMs);
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
  }));
}

// SendMessageBatch accepts at most ten entries per call, so a whole flush
// window's aggregates go out in ceil(n/10) batch calls rather than n
// individual SendMessage calls. Same plain-function style as publish():
// the client arrives as a parameter, nothing is wrapped in an object.
const BATCH_LIMIT = 10;

async function publishBatch(sqsClient, queueName, payloads, retries, delayMs) {
  if (!payloads.length) return 0;
  const queueUrl = await resolveQueueUrl(sqsClient, queueName, retries, delayMs);
  let calls = 0;
  for (let start = 0; start < payloads.length; start += BATCH_LIMIT) {
    const entries = payloads.slice(start, start + BATCH_LIMIT).map((payload, offset) => ({
      Id: String(start + offset),
      MessageBody: JSON.stringify(payload),
    }));
    await sqsClient.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }));
    calls += 1;
  }
  return calls;
}

function clearQueueUrlCache() {
  queueUrlCache.clear();
}

module.exports = { publish, publishBatch, resolveQueueUrl, buildClient, clearQueueUrlCache };
