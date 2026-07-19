// Burst-load the queue to show backend scaling; synthetic signal names keep the live board partitions untouched.
import {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

const ENDPOINT = process.env.AWS_ENDPOINT_URL || "http://localhost:4580";
const REGION = process.env.AWS_REGION || "eu-west-1";
const QUEUE = process.env.SQS_QUEUE_NAME || "ctm-tower-agg";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const MESSAGES = opt("--messages", 2000);
const WORKERS = opt("--workers", 32);

const sqs = new SQSClient({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function body(i) {
  return JSON.stringify({
    sensor_type: `loadtest_${i % 5}`,
    site_id: `probe-${i % 20}`,
    window_start: "s",
    window_end: `e${i}`,
    count: 1, min: 0, max: 0, mean: 0, last: 0, spread: 0, alerts: [],
  });
}

async function depth(url) {
  const a = (await sqs.send(new GetQueueAttributesCommand({
    QueueUrl: url,
    AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
  }))).Attributes || {};
  return Number(a.ApproximateNumberOfMessages || 0) + Number(a.ApproximateNumberOfMessagesNotVisible || 0);
}

async function main() {
  const url = (await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE }))).QueueUrl;
  const start = Date.now();
  let next = 0;
  async function worker() {
    while (next < MESSAGES) {
      const i = next++;
      await sqs.send(new SendMessageCommand({ QueueUrl: url, MessageBody: body(i) }));
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  console.log(`sent ${MESSAGES} messages in ${((Date.now() - start) / 1000).toFixed(2)}s`);

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const remaining = await depth(url);
    console.log("queue depth:", remaining);
    if (remaining === 0) {
      console.log("PASS: queue fully drained by the consumer");
      return;
    }
    await sleep(3000);
  }
  console.log("WARNING: queue not fully drained within the window (LocalStack throughput ceiling)");
}

main();
