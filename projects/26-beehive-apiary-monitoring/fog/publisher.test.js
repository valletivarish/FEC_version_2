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

test("publishBatch is an async generator function", () => {
  assert.equal(gateway.publishBatch.constructor.name, "AsyncGeneratorFunction");
});

test("publishBatch throws when the publisher has not been configured", async () => {
  const iterator = gateway.publishBatch("some-queue", [{ a: 1 }]);
  await assert.rejects(() => iterator.next());
});

test("publishBatch sends one real SendMessageBatchCommand covering every payload up to the 10-entry limit", async () => {
  const batchCalls = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/bam-apiary-agg" };
      batchCalls.push(command.input.Entries.map((e) => JSON.parse(e.MessageBody)));
      return {};
    },
  };
  gateway.useClient(client);

  const payloads = [{ sensor_type: "hive_weight_kg", avg: 35 }, { sensor_type: "internal_hive_temp_c", avg: 34 }];
  const results = [];
  for await (const result of gateway.publishBatch("bam-apiary-agg", payloads, 3, 0)) {
    results.push(result);
  }
  assert.equal(batchCalls.length, 1, "two payloads fit in a single SendMessageBatch call");
  assert.deepEqual(batchCalls[0], payloads);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.sent === true));
  assert.deepEqual(results.map((r) => r.payload), payloads);
});

test("publishBatch chunks at the 10-entry SendMessageBatch limit across multiple calls", async () => {
  const batchSizes = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/bam-apiary-agg" };
      batchSizes.push(command.input.Entries.length);
      return {};
    },
  };
  gateway.useClient(client);

  const payloads = Array.from({ length: 11 }, (_, i) => ({ i }));
  const results = [];
  for await (const result of gateway.publishBatch("bam-apiary-agg", payloads, 3, 0)) {
    results.push(result);
  }
  assert.deepEqual(batchSizes, [10, 1], "11 payloads split into a 10-entry batch and a 1-entry batch");
  assert.equal(results.length, 11);
  assert.deepEqual(results.map((r) => r.payload.i), payloads.map((p) => p.i));
});

test("publishBatch resolves the queue url once and memoizes it across every batch call", async () => {
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

  const payloads = Array.from({ length: 12 }, (_, i) => ({ i }));
  const results = [];
  for await (const result of gateway.publishBatch("bam-apiary-agg", payloads, 3, 0)) {
    results.push(result);
  }
  assert.equal(lookups, 1, "the queue url lookup should be memoized across every batch in the same generator run");
  assert.equal(results.length, 12);
});

test("publishBatch rejects the in-flight iteration when SendMessageBatch itself rejects", async () => {
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/bam-apiary-agg" };
      throw new Error("batch send failed");
    },
  };
  gateway.useClient(client);

  const iterator = gateway.publishBatch("bam-apiary-agg", [{ a: 1 }], 3, 0);
  await assert.rejects(() => iterator.next(), /batch send failed/);
});

test("publishBatch throws when SendMessageBatch reports partial failures via its Failed array", async () => {
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/bam-apiary-agg" };
      return { Failed: [{ Id: "1", Message: "throttled" }] };
    },
  };
  gateway.useClient(client);

  const iterator = gateway.publishBatch("bam-apiary-agg", [{ a: 1 }, { a: 2 }], 3, 0);
  await assert.rejects(() => iterator.next(), /throttled/);
});
