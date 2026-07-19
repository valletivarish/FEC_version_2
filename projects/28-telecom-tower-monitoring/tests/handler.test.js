import test from "node:test";
import assert from "node:assert/strict";
import { handler, persist, chunk, resolveClient } from "../backend/processor/handler.js";

class FakeDoc {
  constructor(script = []) { this.script = script; this.writes = []; this.round = 0; }
  async send(cmd) {
    const table = Object.keys(cmd.input.RequestItems)[0];
    const requests = cmd.input.RequestItems[table];
    this.writes.push(requests.length);
    const unprocessed = this.script[this.round] || 0;
    this.round += 1;
    if (unprocessed > 0) {
      return { UnprocessedItems: { [table]: requests.slice(0, unprocessed) } };
    }
    return { UnprocessedItems: {} };
  }
}

function windowBody(i) {
  return JSON.stringify({
    sensor_type: "dc_load_amps", site_id: "site-north", unit: "A",
    window_start: "s", window_end: `e${i}`, count: 1, min: 1, max: 1, mean: 1, last: 1, spread: 0, alerts: [],
  });
}

test("chunk splits into DynamoDB-sized groups", () => {
  assert.equal(chunk(Array.from({ length: 30 }), 25).length, 2);
});

test("persist writes all items across 25-item batches", async () => {
  const doc = new FakeDoc();
  const items = Array.from({ length: 30 }, (_, i) => ({ sensor_type: "x", sort_key: `k${i}` }));
  const written = await persist(items, doc);
  assert.equal(written, 30);
  assert.deepEqual(doc.writes, [25, 5]);
});

test("persist retries unprocessed items", async () => {
  const doc = new FakeDoc([2, 0]); // first send leaves 2 unprocessed, retry clears them
  const items = Array.from({ length: 3 }, (_, i) => ({ sensor_type: "x", sort_key: `k${i}` }));
  const written = await persist(items, doc);
  assert.equal(written, 3);
  assert.equal(doc.writes.length, 2);
});

test("persist throws if items stay unprocessed after all retries", async () => {
  const doc = new FakeDoc([1, 1, 1, 1, 1]);
  await assert.rejects(() => persist([{ sensor_type: "x", sort_key: "k" }], doc));
});

test("handler maps SQS records into items and persists them", async () => {
  const doc = new FakeDoc();
  const event = { Records: [{ body: windowBody(1) }, { body: windowBody(2) }] };
  const res = await handler(event, {}, doc);
  assert.equal(res.written, 2);
  assert.deepEqual(res.batchItemFailures, []);
});

test("handler tolerates an empty event", async () => {
  const doc = new FakeDoc();
  const res = await handler({}, {}, doc);
  assert.equal(res.written, 0);
});

test("resolveClient uses a real injected client but ignores the Lambda callback", () => {
  const fake = new FakeDoc();
  assert.equal(resolveClient(fake), fake); // a genuine client (has .send) is used
  const callback = () => {};
  const resolved = resolveClient(callback); // Lambda's 3rd arg at runtime is the callback
  assert.notEqual(resolved, callback);
  assert.equal(typeof resolved.send, "function"); // falls back to the real DynamoDB client
});
