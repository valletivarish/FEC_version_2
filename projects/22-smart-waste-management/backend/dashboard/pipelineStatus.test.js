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
  assert.equal(await isQueueReachable(sqs, "swm-district-agg"), true);
});

test("isQueueReachable returns false when SQS throws", async () => {
  const sqs = { send: async () => { throw new Error("down"); } };
  assert.equal(await isQueueReachable(sqs, "swm-district-agg"), false);
});

test("isLambdaActive returns true only when Configuration.State is Active", async () => {
  const lambda = { send: async () => ({ Configuration: { State: "Active" } }) };
  assert.equal(await isLambdaActive(lambda, "swm-processor"), true);
  const pending = { send: async () => ({ Configuration: { State: "Pending" } }) };
  assert.equal(await isLambdaActive(pending, "swm-processor"), false);
});

test("readQueueCounters parses waiting/in_flight as integers", async () => {
  const sqs = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/x" };
      return { Attributes: { ApproximateNumberOfMessages: "3", ApproximateNumberOfMessagesNotVisible: "1" } };
    },
  };
  const counters = await readQueueCounters(sqs, "swm-district-agg");
  assert.deepEqual(counters, { waiting: 3, in_flight: 1 });
});

test("readQueueCounters returns null on failure", async () => {
  const sqs = { send: async () => { throw new Error("down"); } };
  assert.equal(await readQueueCounters(sqs, "swm-district-agg"), null);
});

test("countTableItems returns the Scan COUNT result", async () => {
  const doc = { send: async () => ({ Count: 42 }) };
  assert.equal(await countTableItems(doc, "swm-readings"), 42);
});

test("isPipelineFlowing is true only when freshestAge is non-null and within the fresh window", () => {
  assert.equal(isPipelineFlowing(null), false);
  assert.equal(isPipelineFlowing(PIPELINE_FRESH_SECONDS), true);
  assert.equal(isPipelineFlowing(PIPELINE_FRESH_SECONDS + 1), false);
});
