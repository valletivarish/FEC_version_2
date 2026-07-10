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
  assert.equal(await isQueueReachable(sqs, "wfm-station-agg"), true);
});

test("isQueueReachable is false when the queue lookup throws", async () => {
  const sqs = fakeClient(() => { throw new Error("nope"); });
  assert.equal(await isQueueReachable(sqs, "missing"), false);
});

test("isLambdaActive reflects the Lambda API reported state", async () => {
  const lambda = fakeClient(() => ({ Configuration: { State: "Active" } }));
  assert.equal(await isLambdaActive(lambda, "wfm-processor"), true);
});

test("isLambdaActive is false when GetFunction throws", async () => {
  const lambda = fakeClient(() => { throw new Error("not deployed"); });
  assert.equal(await isLambdaActive(lambda, "wfm-processor"), false);
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

test("isPipelineFlowing is true only under the freshness threshold", () => {
  assert.equal(isPipelineFlowing(5), true);
  assert.equal(isPipelineFlowing(31), false);
  assert.equal(isPipelineFlowing(null), false);
});
