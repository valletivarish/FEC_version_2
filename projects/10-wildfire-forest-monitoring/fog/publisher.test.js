"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { publish, resolveQueueUrl, clearQueueUrlCache } = require("./publisher");

test.beforeEach(() => clearQueueUrlCache());

test("resolveQueueUrl returns the url on first success", async () => {
  const client = { send: async () => ({ QueueUrl: "http://q/wfm-station-agg" }) };
  const url = await resolveQueueUrl(client, "wfm-station-agg", 3, 0);
  assert.equal(url, "http://q/wfm-station-agg");
});

test("resolveQueueUrl retries then succeeds", async () => {
  let calls = 0;
  const client = {
    send: async () => {
      calls += 1;
      if (calls < 3) throw new Error("not ready");
      return { QueueUrl: "http://q/x" };
    },
  };
  const url = await resolveQueueUrl(client, "retry-queue", 5, 0);
  assert.equal(url, "http://q/x");
  assert.equal(calls, 3);
});

test("resolveQueueUrl throws after exhausting retries", async () => {
  const client = { send: async () => { throw new Error("gone"); } };
  await assert.rejects(() => resolveQueueUrl(client, "dead-queue", 2, 0));
});

test("resolveQueueUrl memoizes concurrent lookups for the same queue name", async () => {
  let calls = 0;
  const client = {
    send: async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { QueueUrl: "http://q/shared" };
    },
  };
  const [a, b] = await Promise.all([
    resolveQueueUrl(client, "shared-queue", 3, 0),
    resolveQueueUrl(client, "shared-queue", 3, 0),
  ]);
  assert.equal(a, "http://q/shared");
  assert.equal(b, "http://q/shared");
  assert.equal(calls, 1, "the second concurrent call should reuse the in-flight lookup, not re-invoke send");
});

test("publish sends a SendMessageCommand to the resolved queue url", async () => {
  const sent = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/wfm-station-agg" };
      sent.push(command);
      return {};
    },
  };
  await publish(client, "publish-target", { sensor_type: "temperature_c", avg: 25 }, 3, 0);
  assert.equal(sent.length, 1);
  const body = JSON.parse(sent[0].input.MessageBody);
  assert.equal(body.sensor_type, "temperature_c");
  assert.equal(sent[0].input.QueueUrl, "http://q/wfm-station-agg");
});
