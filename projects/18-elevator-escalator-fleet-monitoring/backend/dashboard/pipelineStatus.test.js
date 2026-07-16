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

test("countTableItems follows LastEvaluatedKey and sums Count across every page", async () => {
  const pages = [
    { Count: 400, LastEvaluatedKey: { sensor_type: "motor_temp_c" } },
    { Count: 400, LastEvaluatedKey: { sensor_type: "cab_vibration_mm" } },
    { Count: 117 },
  ];
  let call = 0;
  const seenStartKeys = [];
  const doc = {
    send: async (command) => {
      seenStartKeys.push(command.input.ExclusiveStartKey);
      return pages[call++];
    },
  };
  const total = await countTableItems(doc, "eef-readings");
  assert.equal(total, 917, "a single-page Count would undercount a table spanning more than one ~1MB scan page");
  assert.equal(call, 3);
  assert.deepEqual(seenStartKeys, [undefined, { sensor_type: "motor_temp_c" }, { sensor_type: "cab_vibration_mm" }]);
});

test("isPipelineFlowing is true only within PIPELINE_FRESH_SECONDS and not null", () => {
  assert.equal(isPipelineFlowing(null), false);
  assert.equal(isPipelineFlowing(PIPELINE_FRESH_SECONDS), true);
  assert.equal(isPipelineFlowing(PIPELINE_FRESH_SECONDS + 1), false);
});
