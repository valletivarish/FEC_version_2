"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isQueueReachable,
  isLambdaActive,
  readQueueCounters,
  countTableItems,
  checkGateway,
  isPipelineFlowing,
  PIPELINE_FRESH_SECONDS,
} = require("./pipelineStatus");

function fakeSqs(behavior) {
  return { send: async (command) => behavior(command) };
}

function fakeLambda(state) {
  return {
    send: async () => {
      if (state === null) throw new Error("not found");
      return { Configuration: { State: state } };
    },
  };
}

function fakeDocScan(count) {
  return { send: async () => ({ Count: count }) };
}

test("isQueueReachable returns true when both get-url and get-attributes succeed", async () => {
  const sqs = fakeSqs(() => ({ QueueUrl: "http://q/dce-hall-agg", Attributes: { QueueArn: "arn:x" } }));
  assert.equal(await isQueueReachable(sqs, "dce-hall-agg"), true);
});

test("isQueueReachable returns false when the queue lookup throws", async () => {
  const sqs = fakeSqs(() => { throw new Error("no such queue"); });
  assert.equal(await isQueueReachable(sqs, "missing"), false);
});

test("isLambdaActive returns true only when Configuration.State is Active", async () => {
  assert.equal(await isLambdaActive(fakeLambda("Active"), "dce-processor"), true);
  assert.equal(await isLambdaActive(fakeLambda("Pending"), "dce-processor"), false);
  assert.equal(await isLambdaActive(fakeLambda(null), "missing"), false);
});

test("readQueueCounters parses waiting/in_flight as integers", async () => {
  const sqs = fakeSqs((command) => {
    if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/dce-hall-agg" };
    return { Attributes: { ApproximateNumberOfMessages: "3", ApproximateNumberOfMessagesNotVisible: "1" } };
  });
  const counters = await readQueueCounters(sqs, "dce-hall-agg");
  assert.deepEqual(counters, { waiting: 3, in_flight: 1 });
});

test("readQueueCounters returns null on failure rather than throwing", async () => {
  const sqs = fakeSqs(() => { throw new Error("gone"); });
  assert.equal(await readQueueCounters(sqs, "missing"), null);
});

test("countTableItems returns the Count from a COUNT-select scan", async () => {
  assert.equal(await countTableItems(fakeDocScan(42), "dce-readings"), 42);
});

test("countTableItems follows LastEvaluatedKey and sums every page's Count", async () => {
  const pages = [
    { Count: 500, LastEvaluatedKey: { sensor_type: "temperature_c", sort_key: "a" } },
    { Count: 500, LastEvaluatedKey: { sensor_type: "temperature_c", sort_key: "b" } },
    { Count: 214 },
  ];
  let callIndex = 0;
  const doc = {
    send: async (command) => {
      assert.equal(callIndex === 0 ? undefined : pages[callIndex - 1].LastEvaluatedKey, command.input.ExclusiveStartKey);
      return pages[callIndex++];
    },
  };
  assert.equal(await countTableItems(doc, "dce-readings"), 1214);
  assert.equal(callIndex, 3);
});

test("countTableItems degrades to null rather than throwing when the scan fails", async () => {
  const doc = { send: async () => { throw new Error("scan failed"); } };
  assert.equal(await countTableItems(doc, "dce-readings"), null);
});

test("checkGateway returns true only for a real HTTP 200 response", async () => {
  const http = require("node:http");
  const server = http.createServer((req, res) => res.writeHead(200).end("ok"));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const ok = await checkGateway(`http://127.0.0.1:${port}/health`);
  server.close();
  assert.equal(ok, true);
});

test("checkGateway returns false when nothing is listening", async () => {
  assert.equal(await checkGateway("http://127.0.0.1:1/health"), false);
});

test("isPipelineFlowing is true only when freshestAge is non-null and within PIPELINE_FRESH_SECONDS", () => {
  assert.equal(isPipelineFlowing(5), true);
  assert.equal(isPipelineFlowing(PIPELINE_FRESH_SECONDS), true);
  assert.equal(isPipelineFlowing(PIPELINE_FRESH_SECONDS + 1), false);
  assert.equal(isPipelineFlowing(null), false);
});
