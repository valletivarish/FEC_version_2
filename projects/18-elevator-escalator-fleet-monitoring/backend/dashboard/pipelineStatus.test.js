"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isQueueReachable,
  isLambdaActive,
  readQueueCounters,
  countTableItems,
  isPipelineFlowing,
  PIPELINE_FRESH_SECONDS,
} = require("./pipelineStatus");

test("isQueueReachable returns true when both SQS calls succeed", async () => {
  const sqs = { send: async () => ({ QueueUrl: "http://q/x", Attributes: {} }) };
  assert.equal(await isQueueReachable(sqs, "eef-tower-agg"), true);
});

test("isQueueReachable returns false when SQS is unreachable", async () => {
  const sqs = { send: async () => { throw new Error("down"); } };
  assert.equal(await isQueueReachable(sqs, "eef-tower-agg"), false);
});

test("isLambdaActive returns true only when Configuration.State is Active", async () => {
  const lambda = { send: async () => ({ Configuration: { State: "Active" } }) };
  assert.equal(await isLambdaActive(lambda, "eef-processor"), true);
});

test("isLambdaActive returns false for a non-Active state", async () => {
  const lambda = { send: async () => ({ Configuration: { State: "Pending" } }) };
  assert.equal(await isLambdaActive(lambda, "eef-processor"), false);
});

test("readQueueCounters parses waiting/in_flight as integers", async () => {
  const sqs = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/x" };
      return { Attributes: { ApproximateNumberOfMessages: "3", ApproximateNumberOfMessagesNotVisible: "1" } };
    },
  };
  const counters = await readQueueCounters(sqs, "eef-tower-agg");
  assert.deepEqual(counters, { waiting: 3, in_flight: 1 });
});

test("readQueueCounters returns null on failure", async () => {
  const sqs = { send: async () => { throw new Error("boom"); } };
  assert.equal(await readQueueCounters(sqs, "eef-tower-agg"), null);
});

test("countTableItems returns the scan Count", async () => {
  const doc = { send: async () => ({ Count: 42 }) };
  assert.equal(await countTableItems(doc, "eef-readings"), 42);
});

test("isPipelineFlowing is true only within PIPELINE_FRESH_SECONDS and not null", () => {
  assert.equal(isPipelineFlowing(null), false);
  assert.equal(isPipelineFlowing(PIPELINE_FRESH_SECONDS), true);
  assert.equal(isPipelineFlowing(PIPELINE_FRESH_SECONDS + 1), false);
});
