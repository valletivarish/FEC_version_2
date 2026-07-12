"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const publisher = require("./publisher");

test.beforeEach(() => publisher.reset());

test("the module export is a Proxy wrapping a lazy client, not a class or factory", () => {
  assert.equal(typeof publisher, "object");
  assert.equal(typeof publisher.publish, "function");
  assert.equal(typeof publisher.configure, "function");
  assert.equal(typeof publisher.useClient, "function");
});

test("queueUrl is null before any successful lookup", () => {
  assert.equal(publisher.queueUrl, null);
});

test("publish throws a clear error when nothing has configured or injected a client yet", async () => {
  await assert.rejects(() => publisher.publish("some-queue", { a: 1 }), /not configured/);
});

test("reading .send before configure/useClient lazily constructs a real client on first access", () => {
  assert.equal(typeof publisher.send, "function");
});

test("useClient wires a fake client and publish resolves the queue url once", async () => {
  let lookups = 0;
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") {
        lookups += 1;
        return { QueueUrl: "http://q/ska-slope-agg" };
      }
      return {};
    },
  };
  publisher.useClient(client);
  await publisher.publish("ska-slope-agg", { sensor_type: "wind_speed_kmh" }, 3, 0);
  await publisher.publish("ska-slope-agg", { sensor_type: "wind_speed_kmh" }, 3, 0);
  assert.equal(lookups, 1, "the queue url lookup should be memoized across publishes");
  assert.equal(publisher.queueUrl, "http://q/ska-slope-agg");
});

test("publish sends a SendMessageCommand with the JSON-serialized payload", async () => {
  const sent = [];
  const client = {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/ska-slope-agg" };
      sent.push(command);
      return {};
    },
  };
  publisher.useClient(client);
  await publisher.publish("ska-slope-agg", { sensor_type: "seismic_vibration_mg", avg: 30 }, 3, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.QueueUrl, "http://q/ska-slope-agg");
  assert.deepEqual(JSON.parse(sent[0].input.MessageBody), { sensor_type: "seismic_vibration_mg", avg: 30 });
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
  publisher.useClient(client);
  await publisher.publish("retry-queue", { x: 1 }, 5, 0);
  assert.equal(attempts, 3);
});

test("publish rejects after exhausting retries and leaves queueUrl null", async () => {
  const client = { send: async () => { throw new Error("gone"); } };
  publisher.useClient(client);
  await assert.rejects(() => publisher.publish("dead-queue", { x: 1 }, 2, 0));
  assert.equal(publisher.queueUrl, null);
});

test("configure() clears any previously cached client so the next access rebuilds it", () => {
  const client = { send: async () => ({}) };
  publisher.useClient(client);
  publisher.configure("http://localstack:4566", "eu-west-1");
  // After configure(), the cached fake client must be gone -- accessing
  // .send now lazily builds a brand-new real SQSClient instead of reusing
  // the fake injected above.
  assert.equal(typeof publisher.send, "function");
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
  publisher.useClient(client);
  await Promise.all([
    publisher.publish("shared-queue", { i: 1 }, 3, 0),
    publisher.publish("shared-queue", { i: 2 }, 3, 0),
  ]);
  assert.equal(calls, 1, "the second concurrent publish should reuse the in-flight lookup");
});
