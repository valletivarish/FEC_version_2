"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveQueueUrl, chunk, toBatchEntries } = require("./publisher");

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

test("chunk groups items into batches no larger than the given size", () => {
  const groups = chunk(Array.from({ length: 23 }, (_, i) => i), 10);
  assert.deepEqual(groups.map((g) => g.length), [10, 10, 3]);
});

test("chunk returns no groups for an empty list", () => {
  assert.deepEqual(chunk([], 10), []);
});

test("toBatchEntries assigns sequential ids and JSON-encodes each message", () => {
  const entries = toBatchEntries([{ site_id: "turbine-1" }, { site_id: "turbine-2" }]);
  assert.deepEqual(entries.map((e) => e.Id), ["0", "1"]);
  assert.equal(entries[0].MessageBody, JSON.stringify({ site_id: "turbine-1" }));
  assert.equal(entries[1].MessageBody, JSON.stringify({ site_id: "turbine-2" }));
});
