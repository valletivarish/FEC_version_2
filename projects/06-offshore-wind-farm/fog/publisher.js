"use strict";

const {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand,
  SendMessageBatchCommand,
} = require("@aws-sdk/client-sqs");

const BATCH_LIMIT = 10;

async function resolveQueueUrl(client, queueName, retries, delayMs) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { QueueUrl } = await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
      return QueueUrl;
    } catch (err) {
      if (attempt === retries) throw new Error(`queue ${queueName} not reachable: ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// SendMessageBatch caps at 10 entries per call, so a window with more
// aggregates than that has to be split across multiple batch calls.
function chunk(items, size) {
  const groups = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

function toBatchEntries(messages) {
  return messages.map((message, index) => ({
    Id: String(index),
    MessageBody: JSON.stringify(message),
  }));
}

async function createPublisher({ endpoint, region, queueName, retries = 30, delayMs = 2000 }) {
  const config = { region };
  if (endpoint) {
    // LocalStack has no real IAM behind it, so it needs a placeholder
    // credential pair; a real endpoint (EC2/Lambda) must fall through to
    // the SDK's own default credential chain instead.
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  const client = new SQSClient(config);
  const queueUrl = await resolveQueueUrl(client, queueName, retries, delayMs);

  return {
    async publish(message) {
      await client.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      }));
    },
    async publishBatch(messages) {
      let sent = 0;
      for (const group of chunk(messages, BATCH_LIMIT)) {
        await client.send(new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: toBatchEntries(group),
        }));
        sent += group.length;
      }
      return sent;
    },
    queueUrl,
  };
}

module.exports = { createPublisher, resolveQueueUrl, chunk, toBatchEntries };
