"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const gateway = require("./publisher");

test.beforeEach(() => gateway.clearGateway());

test("the module export is a frozen object literal, not a class or factory", () => {
  assert.equal(typeof gateway, "object");
  assert.ok(Object.isFrozen(gateway));
  assert.equal(typeof gateway.sendOne, "function");
  assert.equal(typeof gateway.openGateway, "function");
});

test("publish throws a clear error when the gateway has not been configured", async () => {
  await assert.rejects(() => gateway.sendOne("some-queue", { a: 1 }), /not configured/);
});

test("attachClient wires a fake client and sendOne resolves the queue url once", async () => {
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
  gateway.attachClient(client);
  await gateway.sendOne("wtu-plant-agg", { sensor_type: "ph_level" }, 3, 0);
  await gateway.sendOne("wtu-plant-agg", { sensor_type: "ph_level" }, 3, 0);
  assert.equal(lookups, 1, "the queue url lookup should be memoized across publishes");
  assert.equal(gateway.queueEndpoint, "http://q/wtu-plant-agg");
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
  gateway.attachClient(client);
  await gateway.sendOne("wtu-plant-agg", { sensor_type: "turbidity_ntu", avg: 3.2 }, 3, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.QueueUrl, "http://q/wtu-plant-agg");
  assert.deepEqual(JSON.parse(sent[0].input.MessageBody), { sensor_type: "turbidity_ntu", avg: 3.2 });
});

test("lookupQueueUrl retries on failure before succeeding, surfaced through sendOne", async () => {
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
  gateway.attachClient(client);
  await gateway.sendOne("retry-queue", { x: 1 }, 5, 0);
  assert.equal(attempts, 3);
});

test("publish rejects after exhausting retries and leaves the gateway retryable", async () => {
  const client = { send: async () => { throw new Error("gone"); } };
  gateway.attachClient(client);
  await assert.rejects(() => gateway.sendOne("dead-queue", { x: 1 }, 2, 0));
  assert.equal(gateway.queueEndpoint, null);
});

test("gateway.queueEndpoint is null before any successful lookup and cannot be reassigned directly", () => {
  assert.equal(gateway.queueEndpoint, null);
  assert.throws(() => {
    gateway.queueEndpoint = "http://not-allowed";
  });
});

test("sendWindow sends every payload in a single SendMessageBatchCommand when under the 10-entry limit", async () => {
  const sent = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/wtu-plant-agg" };
      sent.push(command);
      return {};
    },
  };
  gateway.attachClient(client);
  const payloads = [{ sensor_type: "ph_level" }, { sensor_type: "turbidity_ntu" }, { sensor_type: "chlorine_ppm" }];
  const calls = await gateway.sendWindow("wtu-plant-agg", payloads, 3, 0);
  assert.equal(calls, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.Entries.length, 3);
  assert.deepEqual(sent[0].input.Entries.map((e) => JSON.parse(e.MessageBody)), payloads);
});

test("sendWindow chunks more than 10 payloads into multiple SendMessageBatchCommand calls", async () => {
  const sent = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/wtu-plant-agg" };
      sent.push(command);
      return {};
    },
  };
  gateway.attachClient(client);
  const payloads = Array.from({ length: 23 }, (_, i) => ({ i }));
  const calls = await gateway.sendWindow("wtu-plant-agg", payloads, 3, 0);
  assert.equal(calls, 3);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((c) => c.input.Entries.length), [10, 10, 3]);
});

test("sendWindow resolves with 0 and sends nothing for an empty payload list", async () => {
  let sends = 0;
  const client = { send: async () => { sends += 1; return {}; } };
  gateway.attachClient(client);
  const calls = await gateway.sendWindow("wtu-plant-agg", [], 3, 0);
  assert.equal(calls, 0);
  assert.equal(sends, 0);
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
  gateway.attachClient(client);
  await Promise.all([
    gateway.sendOne("shared-queue", { i: 1 }, 3, 0),
    gateway.sendOne("shared-queue", { i: 2 }, 3, 0),
  ]);
  assert.equal(calls, 1, "the second concurrent publish should reuse the in-flight lookup");
});
