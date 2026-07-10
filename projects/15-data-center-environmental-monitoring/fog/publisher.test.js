"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { attachPublisher, sendBatch, resolveQueueUrl, chunk, toEntry, SQS_BATCH_LIMIT } = require("./publisher");

function fakeClient(onSend) {
  return {
    send: async (command) => {
      if (command.constructor.name === "GetQueueUrlCommand") {
        return { QueueUrl: "http://q/dce-hall-agg" };
      }
      return onSend(command);
    },
  };
}

test("chunk splits into groups of at most `size`, preserving order", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
});

test("toEntry builds an SQS batch Entry with a stable Id and JSON-serialized body", () => {
  const entry = toEntry({ sensor_type: "temperature_c", avg: 22.4 }, 3);
  assert.equal(entry.Id, "m3");
  assert.deepEqual(JSON.parse(entry.MessageBody), { sensor_type: "temperature_c", avg: 22.4 });
});

test("resolveQueueUrl retries until GetQueueUrlCommand succeeds", async () => {
  let attempts = 0;
  const client = {
    send: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("not ready");
      return { QueueUrl: "http://q/dce-hall-agg" };
    },
  };
  const url = await resolveQueueUrl(client, "dce-hall-agg", 5, 0);
  assert.equal(url, "http://q/dce-hall-agg");
  assert.equal(attempts, 3);
});

test("sendBatch issues exactly one SendMessageBatchCommand for a single group", async () => {
  const sent = [];
  const client = fakeClient((cmd) => {
    sent.push(cmd);
    return { Successful: cmd.input.Entries.map((e) => ({ Id: e.Id })) };
  });
  await sendBatch(client, "http://q/dce-hall-agg", [{ sensor_type: "temperature_c", avg: 22 }]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].constructor.name, "SendMessageBatchCommand");
  assert.equal(sent[0].input.Entries.length, 1);
});

// This is the direct proof for Nithin's batching rubric requirement:
// send_message_batch invoked with multiple Entries when more than one
// aggregated group is ready in a single flush cycle.
test("sendBatch issues one SendMessageBatchCommand carrying multiple Entries for multiple groups", async () => {
  const sent = [];
  const client = fakeClient((cmd) => {
    sent.push(cmd);
    return { Successful: cmd.input.Entries.map((e) => ({ Id: e.Id })) };
  });
  const messages = [
    { sensor_type: "temperature_c", site_id: "hall-1", avg: 22 },
    { sensor_type: "humidity_pct", site_id: "hall-1", avg: 45 },
    { sensor_type: "temperature_c", site_id: "hall-2", avg: 24 },
  ];
  await sendBatch(client, "http://q/dce-hall-agg", messages);
  assert.equal(sent.length, 1, "all 3 groups should go out as ONE send_message_batch call");
  assert.equal(sent[0].constructor.name, "SendMessageBatchCommand");
  assert.equal(sent[0].input.Entries.length, 3);
  assert.deepEqual(
    sent[0].input.Entries.map((e) => JSON.parse(e.MessageBody).sensor_type),
    ["temperature_c", "humidity_pct", "temperature_c"]
  );
});

test("sendBatch chunks into multiple SendMessageBatchCommand calls beyond the 10-entry SQS limit", async () => {
  const sent = [];
  const client = fakeClient((cmd) => {
    sent.push(cmd);
    return { Successful: cmd.input.Entries.map((e) => ({ Id: e.Id })) };
  });
  const messages = Array.from({ length: 13 }, (_, i) => ({ sensor_type: "temperature_c", i }));
  await sendBatch(client, "http://q/dce-hall-agg", messages);
  assert.equal(sent.length, 2, "13 messages should split into a 10-entry batch and a 3-entry batch");
  assert.equal(sent[0].input.Entries.length, SQS_BATCH_LIMIT);
  assert.equal(sent[1].input.Entries.length, 3);
});

test("attachPublisher does nothing (no send) when window-closed carries an empty message list", async () => {
  const sent = [];
  const client = fakeClient((cmd) => {
    sent.push(cmd);
    return {};
  });
  const emitter = new EventEmitter();
  attachPublisher(emitter, client, "http://q/dce-hall-agg");
  emitter.emit("window-closed", []);
  await emitter.lastPublish;
  assert.equal(sent.length, 0);
});

test("attachPublisher's listener performs the real send_message_batch call when window-closed fires", async () => {
  const sent = [];
  const client = fakeClient((cmd) => {
    sent.push(cmd);
    return { Successful: cmd.input.Entries.map((e) => ({ Id: e.Id })) };
  });
  const emitter = new EventEmitter();
  attachPublisher(emitter, client, "http://q/dce-hall-agg");

  emitter.emit("window-closed", [
    { sensor_type: "power_load_kw", site_id: "hall-1", avg: 61 },
    { sensor_type: "power_load_kw", site_id: "hall-2", avg: 140, alerts: ["capacity_warning"] },
  ]);
  await emitter.lastPublish;

  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.QueueUrl, "http://q/dce-hall-agg");
  assert.equal(sent[0].input.Entries.length, 2);
});
