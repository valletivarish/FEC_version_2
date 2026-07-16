"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { QueueGateway } = require("./queueGateway");

function stubbedGateway() {
  const gateway = Object.create(QueueGateway.prototype);
  gateway.queueUrl = "http://q";
  gateway.calls = [];
  gateway.client = { send: async (command) => { gateway.calls.push(command.input); return {}; } };
  return gateway;
}

test("sendBatch chunks payloads at the 10-entry SendMessageBatch limit", async () => {
  const gateway = stubbedGateway();
  const payloads = Array.from({ length: 23 }, (_, i) => ({ n: i }));
  await gateway.sendBatch(payloads);
  assert.equal(gateway.calls.length, 3);
  assert.equal(gateway.calls[0].Entries.length, 10);
  assert.equal(gateway.calls[1].Entries.length, 10);
  assert.equal(gateway.calls[2].Entries.length, 3);
  assert.deepEqual(gateway.calls[0].Entries[0], { Id: "0", MessageBody: JSON.stringify({ n: 0 }) });
  assert.deepEqual(gateway.calls[2].Entries[2], { Id: "22", MessageBody: JSON.stringify({ n: 22 }) });
});

test("sendBatch issues no calls for an empty payload list", async () => {
  const gateway = stubbedGateway();
  await gateway.sendBatch([]);
  assert.equal(gateway.calls.length, 0);
});
