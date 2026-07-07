"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

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

async function createPublisher({ endpoint, region, queueName, retries = 30, delayMs = 2000 }) {
  const client = new SQSClient({
    endpoint,
    region,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  const queueUrl = await resolveQueueUrl(client, queueName, retries, delayMs);

  return {
    async publish(message) {
      await client.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      }));
    },
    queueUrl,
  };
}

module.exports = { createPublisher, resolveQueueUrl };
