"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isQueueReachable,
  isLambdaActive,
  readQueueCounters,
  countTableItems,
  isPipelineFlowing,
} = require("./pipelineStatus");

function clientAnswering(responder) {
  return { send: async (command) => responder(command) };
}

test("isQueueReachable is true when lookup and attributes both succeed", async () => {
  const sqs = clientAnswering(() => ({ QueueUrl: "http://q" }));
  assert.equal(await isQueueReachable(sqs, "wfm-station-agg"), true);
});

test("isQueueReachable is false when the queue lookup throws", async () => {
  const sqs = clientAnswering(() => { throw new Error("nope"); });
  assert.equal(await isQueueReachable(sqs, "missing"), false);
});

test("isLambdaActive reflects the Lambda API reported state", async () => {
  const lambda = clientAnswering(() => ({ Configuration: { State: "Active" } }));
  assert.equal(await isLambdaActive(lambda, "wfm-processor"), true);
});

test("isLambdaActive is false when GetFunction throws", async () => {
  const lambda = clientAnswering(() => { throw new Error("not deployed"); });
  assert.equal(await isLambdaActive(lambda, "wfm-processor"), false);
});

test("readQueueCounters parses waiting and in-flight as integers", async () => {
  let call = 0;
  const sqs = clientAnswering(() => {
    call += 1;
    if (call === 1) return { QueueUrl: "http://q" };
    return { Attributes: { ApproximateNumberOfMessages: "5", ApproximateNumberOfMessagesNotVisible: "2" } };
  });
  assert.deepEqual(await readQueueCounters(sqs, "q"), { waiting: 5, in_flight: 2 });
});

test("countTableItems returns the scan count", async () => {
  const doc = clientAnswering(() => ({ Count: 17 }));
  assert.equal(await countTableItems(doc, "table"), 17);
});

test("countTableItems follows LastEvaluatedKey and sums every page", async () => {
  const pages = [
    { Count: 620, LastEvaluatedKey: { sensor_type: "a" } },
    { Count: 275, LastEvaluatedKey: { sensor_type: "b" } },
    { Count: 190, LastEvaluatedKey: { sensor_type: "c" } },
    { Count: 88 },
  ];
  const startKeys = [];
  let call = 0;
  const doc = clientAnswering((command) => {
    startKeys.push(command.input.ExclusiveStartKey);
    return pages[call++];
  });
  assert.equal(await countTableItems(doc, "table"), 1173);
  assert.equal(call, 4, "all four pages must be fetched");
  assert.equal(startKeys[0], undefined);
  assert.deepEqual(startKeys[3], { sensor_type: "c" }, "each page must resume from the previous LastEvaluatedKey");
});

test("isPipelineFlowing is true only under the freshness threshold", () => {
  assert.equal(isPipelineFlowing(5), true);
  assert.equal(isPipelineFlowing(31), false);
  assert.equal(isPipelineFlowing(null), false);
});
