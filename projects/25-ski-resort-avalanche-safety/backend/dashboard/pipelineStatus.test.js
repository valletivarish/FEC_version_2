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
} = require("./pipelineStatus");

test("isQueueReachable returns true when both SQS calls succeed", async () => {
  const sqs = { send: async () => ({ QueueUrl: "http://q/ska-slope-agg", Attributes: {} }) };
  assert.equal(await isQueueReachable(sqs, "ska-slope-agg"), true);
});

test("isQueueReachable returns false when SQS throws", async () => {
  const sqs = { send: async () => { throw new Error("down"); } };
  assert.equal(await isQueueReachable(sqs, "ska-slope-agg"), false);
});

test("isLambdaActive returns true only when the function state is Active", async () => {
  const lambda = { send: async () => ({ Configuration: { State: "Active" } }) };
  assert.equal(await isLambdaActive(lambda, "ska-processor"), true);

  const pendingLambda = { send: async () => ({ Configuration: { State: "Pending" } }) };
  assert.equal(await isLambdaActive(pendingLambda, "ska-processor"), false);
});

test("isLambdaActive returns false when the lambda client throws", async () => {
  const lambda = { send: async () => { throw new Error("not found"); } };
  assert.equal(await isLambdaActive(lambda, "ska-processor"), false);
});

test("readQueueCounters parses waiting/in_flight counts", async () => {
  const sqs = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/x" };
      return { Attributes: { ApproximateNumberOfMessages: "4", ApproximateNumberOfMessagesNotVisible: "1" } };
    },
  };
  assert.deepEqual(await readQueueCounters(sqs, "ska-slope-agg"), { waiting: 4, in_flight: 1 });
});

test("readQueueCounters returns null when SQS is unreachable", async () => {
  const sqs = { send: async () => { throw new Error("down"); } };
  assert.equal(await readQueueCounters(sqs, "ska-slope-agg"), null);
});

test("countTableItems returns the Scan COUNT result", async () => {
  const doc = { send: async () => ({ Count: 42 }) };
  assert.equal(await countTableItems(doc, "ska-readings"), 42);
});

test("countTableItems sums every page instead of stopping at the first", async () => {
  const pages = [
    { Count: 512, LastEvaluatedKey: { site_id: "slope-a" } },
    { Count: 340, LastEvaluatedKey: { site_id: "slope-b" } },
    { Count: 289, LastEvaluatedKey: { site_id: "slope-a" } },
    { Count: 156 },
  ];
  let calls = 0;
  const doc = {
    send: async (command) => {
      assert.equal(command.input.ExclusiveStartKey, pages[calls - 1]?.LastEvaluatedKey);
      return pages[calls++];
    },
  };
  assert.equal(await countTableItems(doc, "ska-readings"), 1297);
  assert.equal(calls, 4, "all four pages must be scanned, not just the first");
});

test("isPipelineFlowing is false when freshestAge is null or stale, true when recent", () => {
  assert.equal(isPipelineFlowing(null), false);
  assert.equal(isPipelineFlowing(31), false);
  assert.equal(isPipelineFlowing(29), true);
});

test("checkGateway returns false against an unreachable URL", async () => {
  assert.equal(await checkGateway("http://127.0.0.1:1/health"), false);
});
