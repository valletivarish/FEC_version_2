"use strict";

const {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand,
  SendMessageBatchCommand,
} = require("@aws-sdk/client-sqs");

const BATCH_LIMIT = 10;

class QueueGateway {
  constructor(endpoint, region, queueName) {
    const config = { region };
    if (endpoint) {
      config.endpoint = endpoint;
      config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
    }
    this.client = new SQSClient(config);
    this.queueName = queueName;
    this.queueUrl = null;
  }

  async init() {
    this.queueUrl = await this._awaitQueue(this.queueName);
    return this;
  }

  async _awaitQueue(queueName, attempts = 30, delayMs = 2000) {
    for (let i = 0; i < attempts; i++) {
      try {
        const resp = await this.client.send(new GetQueueUrlCommand({ QueueName: queueName }));
        return resp.QueueUrl;
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(`queue ${queueName} never became available`);
  }

  async send(payload) {
    await this.client.send(new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(payload),
    }));
  }

  async sendBatch(payloads) {
    for (let offset = 0; offset < payloads.length; offset += BATCH_LIMIT) {
      const chunk = payloads.slice(offset, offset + BATCH_LIMIT);
      await this.client.send(new SendMessageBatchCommand({
        QueueUrl: this.queueUrl,
        Entries: chunk.map((payload, i) => ({
          Id: String(offset + i),
          MessageBody: JSON.stringify(payload),
        })),
      }));
    }
  }
}

module.exports = { QueueGateway };
