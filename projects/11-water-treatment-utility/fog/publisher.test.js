"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const gateway = require("./publisher");

test.beforeEach(() => gateway.reset());

test("the module export is a frozen object literal, not a class or factory", () => {
  assert.equal(typeof gateway, "object");
  assert.ok(Object.isFrozen(gateway));
  assert.equal(typeof gateway.publish, "function");
  assert.equal(typeof gateway.configure, "function");
});

test("publish throws a clear error when the gateway has not been configured", async () => {
  await assert.rejects(() => gateway.publish("some-queue", { a: 1 }), /not configured/);
});

test("useClient wires a fake client and publish resolves the queue url once", async () => {
  let lookups = 0;
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") {
        lookups += 1;
        return { QueueUrl: "http://q/wtu-plant-agg" };
      }
      return {};
    },
  };
  gateway.useClient(client);
  await gateway.publish("wtu-plant-agg", { sensor_type: "ph_level" }, 3, 0);
  await gateway.publish("wtu-plant-agg", { sensor_type: "ph_level" }, 3, 0);
  assert.equal(lookups, 1, "the queue url lookup should be memoized across publishes");
  assert.equal(gateway.queueUrl, "http://q/wtu-plant-agg");
});

test("publish sends a SendMessageCommand with the JSON-serialized payload", async () => {
  const sent = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/wtu-plant-agg" };
      sent.push(command);
      return {};
    },
  };
  gateway.useClient(client);
  await gateway.publish("wtu-plant-agg", { sensor_type: "turbidity_ntu", avg: 3.2 }, 3, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.QueueUrl, "http://q/wtu-plant-agg");
  assert.deepEqual(JSON.parse(sent[0].input.MessageBody), { sensor_type: "turbidity_ntu", avg: 3.2 });
});

test("resolveQueueUrl retries on failure before succeeding, surfaced through publish", async () => {
  let attempts = 0;
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") {
        attempts += 1;
        if (attempts < 3) throw new Error("not ready");
        return { QueueUrl: "http://q/retry" };
      }
      return {};
    },
  };
  gateway.useClient(client);
  await gateway.publish("retry-queue", { x: 1 }, 5, 0);
  assert.equal(attempts, 3);
});

test("publish rejects after exhausting retries and leaves the gateway retryable", async () => {
  const client = { send: async () => { throw new Error("gone"); } };
  gateway.useClient(client);
  await assert.rejects(() => gateway.publish("dead-queue", { x: 1 }, 2, 0));
  assert.equal(gateway.queueUrl, null);
});

test("gateway.queueUrl is null before any successful lookup and cannot be reassigned directly", () => {
  assert.equal(gateway.queueUrl, null);
  assert.throws(() => {
    gateway.queueUrl = "http://not-allowed";
  });
});

test("concurrent publishes for the same queue share one in-flight lookup", async () => {
  let calls = 0;
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { QueueUrl: "http://q/shared" };
      }
      return {};
    },
  };
  gateway.useClient(client);
  await Promise.all([
    gateway.publish("shared-queue", { i: 1 }, 3, 0),
    gateway.publish("shared-queue", { i: 2 }, 3, 0),
  ]);
  assert.equal(calls, 1, "the second concurrent publish should reuse the in-flight lookup");
});
