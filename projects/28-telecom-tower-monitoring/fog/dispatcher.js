import {
  SQSClient,
  GetQueueUrlCommand,
  CreateQueueCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";

const REGION = process.env.AWS_REGION || "eu-west-1";
const ENDPOINT = process.env.AWS_ENDPOINT_URL || undefined;
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "ctm-tower-agg";

function makeClient() {
  const cfg = { region: REGION };
  if (ENDPOINT) {
    cfg.endpoint = ENDPOINT;
    cfg.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  return new SQSClient(cfg);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

class Dispatcher {
  constructor(client = makeClient()) {
    this.client = client;
    this.queueUrl = null;
  }

  async configure() {
    try {
      const res = await this.client.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));
      this.queueUrl = res.QueueUrl;
    } catch (err) {
      if (err.name === "QueueDoesNotExist" || err.name === "AWS.SimpleQueueService.NonExistentQueue") {
        const res = await this.client.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }));
        this.queueUrl = res.QueueUrl;
      } else {
        throw err;
      }
    }
    return this.queueUrl;
  }

  async publish(windows) {
    if (!this.queueUrl) await this.configure();
    let sent = 0;
    for (const group of chunk(windows, 10)) {
      const entries = group.map((w, i) => ({ Id: String(i), MessageBody: JSON.stringify(w) }));
      const res = await this.client.send(new SendMessageBatchCommand({ QueueUrl: this.queueUrl, Entries: entries }));
      sent += (res.Successful || []).length;
      if (res.Failed && res.Failed.length > 0) {
        console.error(`dispatcher: ${res.Failed.length} of ${group.length} messages failed`);
      }
    }
    return sent;
  }
}

export { Dispatcher, chunk };
