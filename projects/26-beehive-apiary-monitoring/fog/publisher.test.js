"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const gateway = require("./publisher");

test.beforeEach(() => gateway.reset());

test("publishBatches is an async generator function", () => {
  assert.equal(gateway.publishBatches.constructor.name, "AsyncGeneratorFunction");
});

test("publishBatches throws when the publisher has not been configured", async () => {
  const iterator = gateway.publishBatches("some-queue", [{ a: 1 }]);
  await assert.rejects(() => iterator.next());
});

test("publishBatches yields one result per payload, in order, via for-await", async () => {
  const sent = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/bam-apiary-agg" };
      sent.push(JSON.parse(command.input.MessageBody));
      return {};
    },
  };
  gateway.useClient(client);

  const payloads = [{ sensor_type: "hive_weight_kg", avg: 35 }, { sensor_type: "internal_hive_temp_c", avg: 34 }];
  const results = [];
  for await (const result of gateway.publishBatches("bam-apiary-agg", payloads, 3, 0)) {
    results.push(result);
  }
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.sent === true));
  assert.deepEqual(sent, payloads);
});

test("publishBatches resolves the queue url once and memoizes it across payloads", async () => {
  let lookups = 0;
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") {
        lookups += 1;
        return { QueueUrl: "http://q/bam-apiary-agg" };
      }
      return {};
    },
  };
  gateway.useClient(client);

  const results = [];
  for await (const result of gateway.publishBatches("bam-apiary-agg", [{ a: 1 }, { a: 2 }, { a: 3 }], 3, 0)) {
    results.push(result);
  }
  assert.equal(lookups, 1, "the queue url lookup should be memoized across every payload in the same generator run");
  assert.equal(gateway.getQueueUrl(), "http://q/bam-apiary-agg");
});

test("publishBatches gives natural backpressure: the second SQS send has not happened until the caller pulls the first result", async () => {
  const sendOrder = [];
  let resolveFirstSend;
  const firstSendGate = new Promise((resolve) => { resolveFirstSend = resolve; });

  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/bam-apiary-agg" };
      const payload = JSON.parse(command.input.MessageBody);
      if (payload.i === 1) await firstSendGate;
      sendOrder.push(payload.i);
      return {};
    },
  };
  gateway.useClient(client);

  const iterator = gateway.publishBatches("bam-apiary-agg", [{ i: 1 }, { i: 2 }], 3, 0);
  const firstNext = iterator.next();
  // Give the generator a turn; the second send must NOT have happened yet
  // because the generator is suspended awaiting the first client.send() call.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(sendOrder, [], "second payload must not be sent before the first send settles");

  resolveFirstSend();
  await firstNext;
  await iterator.next();
  assert.deepEqual(sendOrder, [1, 2]);
});

test("publish failure rejects the in-flight iteration rather than yielding a failure marker", async () => {
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/bam-apiary-agg" };
      throw new Error("send failed");
    },
  };
  gateway.useClient(client);

  const iterator = gateway.publishBatches("bam-apiary-agg", [{ a: 1 }], 3, 0);
  await assert.rejects(() => iterator.next(), /send failed/);
});

test("resolveQueueUrl-backed retries succeed before publishBatches yields", async () => {
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

  const results = [];
  for await (const result of gateway.publishBatches("bam-apiary-agg", [{ a: 1 }], 5, 0)) {
    results.push(result);
  }
  assert.equal(attempts, 3);
  assert.equal(results.length, 1);
});

test("getQueueUrl is null before any successful lookup", () => {
  assert.equal(gateway.getQueueUrl(), null);
});
