"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

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
  return new SQSClient({
    endpoint,
    region,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
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

function clearQueueUrlCache() {
  queueUrlCache.clear();
}

module.exports = { publish, resolveQueueUrl, buildClient, clearQueueUrlCache };
