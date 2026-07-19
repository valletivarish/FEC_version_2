import test from "node:test";
import assert from "node:assert/strict";
import { Dispatcher, chunk } from "../fog/dispatcher.js";

class FakeSqs {
  constructor(opts = {}) { this.opts = opts; this.calls = []; this.batches = []; }
  async send(cmd) {
    const name = cmd.constructor.name;
    this.calls.push(name);
    if (name === "GetQueueUrlCommand") {
      if (this.opts.missing) { const e = new Error("no queue"); e.name = "QueueDoesNotExist"; throw e; }
      return { QueueUrl: "http://q/ctm-tower-agg" };
    }
    if (name === "CreateQueueCommand") return { QueueUrl: "http://q/created" };
    if (name === "SendMessageBatchCommand") {
      this.batches.push(cmd.input.Entries.length);
      return { Successful: cmd.input.Entries.map((e) => ({ Id: e.Id })), Failed: [] };
    }
    throw new Error("unexpected " + name);
  }
}

test("chunk splits into fixed-size groups", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 10), []);
});

test("configure resolves an existing queue url", async () => {
  const d = new Dispatcher(new FakeSqs());
  const url = await d.configure();
  assert.equal(url, "http://q/ctm-tower-agg");
});

test("configure creates the queue when it does not exist", async () => {
  const fake = new FakeSqs({ missing: true });
  const d = new Dispatcher(fake);
  const url = await d.configure();
  assert.equal(url, "http://q/created");
  assert.ok(fake.calls.includes("CreateQueueCommand"));
});

test("publish batches windows in groups of ten and counts successes", async () => {
  const fake = new FakeSqs();
  const d = new Dispatcher(fake);
  const windows = Array.from({ length: 23 }, (_, i) => ({ window_end: `e${i}` }));
  const sent = await d.publish(windows);
  assert.equal(sent, 23);
  assert.deepEqual(fake.batches, [10, 10, 3]);
});

test("publish auto-configures the queue on first call", async () => {
  const fake = new FakeSqs();
  const d = new Dispatcher(fake);
  await d.publish([{ window_end: "e" }]);
  assert.ok(fake.calls.includes("GetQueueUrlCommand"));
});
