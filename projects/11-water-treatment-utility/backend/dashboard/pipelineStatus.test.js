"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  probeQueueReachable,
  probeProcessorActive,
  sampleQueueDepth,
  tallyStoredReadings,
  probeGatewayHealth,
  pipelineIsCurrent,
} = require("./pipelineStatus");

test("probeQueueReachable returns true when both SQS calls succeed", async () => {
  const sqs = { send: async () => ({ QueueUrl: "http://q/wtu-plant-agg", Attributes: {} }) };
  assert.equal(await probeQueueReachable(sqs, "wtu-plant-agg"), true);
});

test("probeQueueReachable returns false when SQS throws", async () => {
  const sqs = { send: async () => { throw new Error("down"); } };
  assert.equal(await probeQueueReachable(sqs, "wtu-plant-agg"), false);
});

test("probeProcessorActive returns true only when the function state is Active", async () => {
  const lambda = { send: async () => ({ Configuration: { State: "Active" } }) };
  assert.equal(await probeProcessorActive(lambda, "wtu-processor"), true);

  const pendingLambda = { send: async () => ({ Configuration: { State: "Pending" } }) };
  assert.equal(await probeProcessorActive(pendingLambda, "wtu-processor"), false);
});

test("probeProcessorActive returns false when the lambda client throws", async () => {
  const lambda = { send: async () => { throw new Error("not found"); } };
  assert.equal(await probeProcessorActive(lambda, "wtu-processor"), false);
});

test("sampleQueueDepth parses waiting/in_flight counts", async () => {
  const sqs = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/x" };
      return { Attributes: { ApproximateNumberOfMessages: "4", ApproximateNumberOfMessagesNotVisible: "1" } };
    },
  };
  assert.deepEqual(await sampleQueueDepth(sqs, "wtu-plant-agg"), { waiting: 4, in_flight: 1 });
});

test("sampleQueueDepth returns null when SQS is unreachable", async () => {
  const sqs = { send: async () => { throw new Error("down"); } };
  assert.equal(await sampleQueueDepth(sqs, "wtu-plant-agg"), null);
});

test("tallyStoredReadings returns the Scan COUNT result", async () => {
  const doc = { send: async () => ({ Count: 42 }) };
  assert.equal(await tallyStoredReadings(doc, "wtu-readings"), 42);
});

test("tallyStoredReadings follows LastEvaluatedKey and sums Count across every page", async () => {
  const pages = [
    { Count: 40, LastEvaluatedKey: { sort_key: "a" } },
    { Count: 40, LastEvaluatedKey: { sort_key: "b" } },
    { Count: 15 },
  ];
  let calls = 0;
  const seenStartKeys = [];
  const doc = {
    send: async (command) => {
      seenStartKeys.push(command.input.ExclusiveStartKey);
      return pages[calls++];
    },
  };
  const total = await tallyStoredReadings(doc, "wtu-readings");
  assert.equal(total, 95, "count should be summed across all three pages, not just the first");
  assert.equal(calls, 3);
  assert.deepEqual(seenStartKeys, [undefined, { sort_key: "a" }, { sort_key: "b" }]);
});

test("pipelineIsCurrent is false when freshestAge is null or stale, true when recent", () => {
  assert.equal(pipelineIsCurrent(null), false);
  assert.equal(pipelineIsCurrent(31), false);
  assert.equal(pipelineIsCurrent(29), true);
});

test("probeGatewayHealth returns false against an unreachable URL", async () => {
  assert.equal(await probeGatewayHealth("http://127.0.0.1:1/health"), false);
});

