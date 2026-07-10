"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const queue = require("./publishQueue");

test.beforeEach(() => queue.reset());

test("publish rejects when the queue has not been configured", async () => {
  await assert.rejects(() => queue.publish("some-queue", { a: 1 }), /not configured/);
});

test("useClient wires a fake client and publish resolves the queue url once", async () => {
  let lookups = 0;
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") {
        lookups += 1;
        return { QueueUrl: "http://q/swm-district-agg" };
      }
      return {};
    },
  };
  queue.useClient(client);
  await queue.publish("swm-district-agg", { sensor_type: "fill_level_pct" }, 3, 0);
  await queue.publish("swm-district-agg", { sensor_type: "fill_level_pct" }, 3, 0);
  assert.equal(lookups, 1, "the queue url lookup should be memoized across publishes");
  assert.equal(queue.getQueueUrl(), "http://q/swm-district-agg");
});

test("publish sends a SendMessageCommand with the JSON-serialized payload", async () => {
  const sent = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/swm-district-agg" };
      sent.push(command);
      return {};
    },
  };
  queue.useClient(client);
  await queue.publish("swm-district-agg", { sensor_type: "gas_level_ppm", avg: 120 }, 3, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.QueueUrl, "http://q/swm-district-agg");
  assert.deepEqual(JSON.parse(sent[0].input.MessageBody), { sensor_type: "gas_level_ppm", avg: 120 });
});

test("concurrent publishes are drained strictly one at a time, in FIFO order, by a single pump", async () => {
  const order = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/fifo" };
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const body = JSON.parse(command.input.MessageBody);
      await new Promise((r) => setTimeout(r, 5));
      order.push(body.i);
      inFlight -= 1;
      return {};
    },
  };
  queue.useClient(client);
  await Promise.all([
    queue.publish("fifo", { i: 1 }, 3, 0),
    queue.publish("fifo", { i: 2 }, 3, 0),
    queue.publish("fifo", { i: 3 }, 3, 0),
  ]);
  assert.equal(maxInFlight, 1, "sends must never overlap -- only one pump runs at a time");
  assert.deepEqual(order, [1, 2, 3], "jobs are drained in strict arrival order");
});

test("a rejected job does not stop the pump from draining jobs queued after it", async () => {
  let attempt = 0;
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/x" };
      attempt += 1;
      if (attempt === 1) throw new Error("boom");
      return {};
    },
  };
  queue.useClient(client);
  const first = queue.publish("x", { i: 1 }, 1, 0);
  const second = queue.publish("x", { i: 2 }, 1, 0);
  await assert.rejects(first);
  await assert.equal(await second, undefined);
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
  queue.useClient(client);
  await queue.publish("retry-queue", { x: 1 }, 5, 0);
  assert.equal(attempts, 3);
});

test("getQueueUrl is null before any successful lookup", () => {
  assert.equal(queue.getQueueUrl(), null);
});
