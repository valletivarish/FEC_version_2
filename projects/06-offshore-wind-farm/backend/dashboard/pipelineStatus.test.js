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

function fakeClient(responder) {
  return { send: async (command) => responder(command) };
}

test("isQueueReachable is true when lookup and attributes both succeed", async () => {
  const sqs = fakeClient(() => ({ QueueUrl: "http://q" }));
  assert.equal(await isQueueReachable(sqs, "owf-turbine-agg"), true);
});

test("isQueueReachable is false when the queue lookup throws", async () => {
  const sqs = fakeClient(() => { throw new Error("nope"); });
  assert.equal(await isQueueReachable(sqs, "missing"), false);
});

test("isLambdaActive reflects the Lambda API reported state", async () => {
  const lambda = fakeClient(() => ({ Configuration: { State: "Active" } }));
  assert.equal(await isLambdaActive(lambda, "owf-processor"), true);
});

test("isLambdaActive is false when GetFunction throws", async () => {
  const lambda = fakeClient(() => { throw new Error("not deployed"); });
  assert.equal(await isLambdaActive(lambda, "owf-processor"), false);
});

test("readQueueCounters parses waiting and in-flight as integers", async () => {
  let call = 0;
  const sqs = fakeClient(() => {
    call += 1;
    if (call === 1) return { QueueUrl: "http://q" };
    return { Attributes: { ApproximateNumberOfMessages: "5", ApproximateNumberOfMessagesNotVisible: "2" } };
  });
  assert.deepEqual(await readQueueCounters(sqs, "q"), { waiting: 5, in_flight: 2 });
});

test("countTableItems returns the scan count", async () => {
  const doc = fakeClient(() => ({ Count: 17 }));
  assert.equal(await countTableItems(doc, "table"), 17);
});

test("countTableItems follows LastEvaluatedKey and sums every page", async () => {
  let call = 0;
  const doc = fakeClient((command) => {
    call += 1;
    if (call === 1) {
      assert.equal(command.input.ExclusiveStartKey, undefined);
      return { Count: 100, LastEvaluatedKey: { pk: "a" } };
    }
    if (call === 2) {
      assert.deepEqual(command.input.ExclusiveStartKey, { pk: "a" });
      return { Count: 100, LastEvaluatedKey: { pk: "b" } };
    }
    assert.deepEqual(command.input.ExclusiveStartKey, { pk: "b" });
    return { Count: 42 };
  });
  assert.equal(await countTableItems(doc, "table"), 242);
  assert.equal(call, 3);
});

test("isPipelineFlowing is true only under the freshness threshold", () => {
  assert.equal(isPipelineFlowing(5), true);
  assert.equal(isPipelineFlowing(31), false);
  assert.equal(isPipelineFlowing(null), false);
});
