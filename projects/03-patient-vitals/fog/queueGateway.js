"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

class QueueGateway {
  constructor(endpoint, region, queueName) {
    this.client = new SQSClient({
      endpoint,
      region,
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
    });
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
}

module.exports = { QueueGateway };
