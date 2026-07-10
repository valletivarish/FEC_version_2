"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// A self-draining async FIFO work queue, not any of the six publisher
// shapes already used in this portfolio: 03-patient-vitals' QueueGateway is
// a class (constructor + init() + send()); 06-offshore-wind-farm's
// createPublisher() is a closure factory returning a fresh
// { publish, queueUrl } object per call; 10-wildfire-forest-monitoring's
// publish() is a bare exported function taking the SQS client as an
// explicit parameter on every call, with a module-level Map cache for
// queue-url memoization; 11-water-treatment-utility's module.exports IS a
// single Object.freeze()'d object literal; 15-data-center-environmental-
// monitoring decouples flush from send via an EventEmitter "window-closed"
// listener that calls SendMessageBatchCommand; and
// 18-elevator-escalator-fleet-monitoring wires a real Node
// stream.Transform/stream.Writable pipeline.
//
// Here, publish() never calls SendMessageCommand itself -- it only pushes a
// job onto a private in-memory queue and returns a Promise that settles
// once THAT job is actually sent. A single "pump" (_pump) drains the queue
// strictly one job at a time, in FIFO arrival order, and is only ever
// running once at a time: if a pump is already active, publish() just
// appends and trusts the running pump to reach the new job. This guarantees
// SQS sends for this fog node are never issued concurrently, without the
// caller (app.js's flush loop) having to serialize its own await calls.
let _client = null;
let _queueUrlPromise = null;
let _resolvedQueueUrl = null;
const _jobs = [];
let _pumping = false;

function configure(endpoint, region) {
  _client = new SQSClient({
    endpoint,
    region,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
}

// Test seam: inject a hand-written fake client ({ send: async (cmd) => ... })
// instead of a real SQSClient.
function useClient(client) {
  _client = client;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
}

function resolveQueueUrl(queueName, retries = 30, delayMs = 2000) {
  if (_queueUrlPromise) return _queueUrlPromise;

  _queueUrlPromise = (async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { QueueUrl } = await _client.send(new GetQueueUrlCommand({ QueueName: queueName }));
        _resolvedQueueUrl = QueueUrl;
        return QueueUrl;
      } catch (err) {
        if (attempt === retries) {
          _queueUrlPromise = null;
          throw new Error(`queue ${queueName} not reachable: ${err.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return undefined;
  })();

  return _queueUrlPromise;
}

function publish(queueName, payload, retries, delayMs) {
  if (!_client) return Promise.reject(new Error("publish queue not configured -- call configure() or useClient() first"));
  return new Promise((resolve, reject) => {
    _jobs.push({ queueName, payload, retries, delayMs, resolve, reject });
    _pump();
  });
}

// The sole loop that ever touches SQS. Guarded by _pumping so at most one
// invocation is walking _jobs at a time; every publish() call after the
// first just appends to _jobs and relies on the in-flight pump to reach it.
async function _pump() {
  if (_pumping) return;
  _pumping = true;
  try {
    while (_jobs.length > 0) {
      const job = _jobs.shift();
      try {
        const queueUrl = await resolveQueueUrl(job.queueName, job.retries, job.delayMs);
        await _client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job.payload) }));
        job.resolve();
      } catch (err) {
        job.reject(err);
      }
    }
  } finally {
    _pumping = false;
  }
}

function getQueueUrl() {
  return _resolvedQueueUrl;
}

// Test seam: drop all private state so each test file starts clean.
function reset() {
  _client = null;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
  _jobs.length = 0;
  _pumping = false;
}

module.exports = { configure, useClient, publish, getQueueUrl, reset };
