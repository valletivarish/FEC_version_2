"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveQueueUrl } = require("./publisher");

test("resolveQueueUrl returns the url on first success", async () => {
  const client = { send: async () => ({ QueueUrl: "http://q/owf-turbine-agg" }) };
  const url = await resolveQueueUrl(client, "owf-turbine-agg", 3, 0);
  assert.equal(url, "http://q/owf-turbine-agg");
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
  const url = await resolveQueueUrl(client, "x", 5, 0);
  assert.equal(url, "http://q/x");
  assert.equal(calls, 3);
});

test("resolveQueueUrl throws after exhausting retries", async () => {
  const client = { send: async () => { throw new Error("gone"); } };
  await assert.rejects(() => resolveQueueUrl(client, "x", 2, 0));
});
