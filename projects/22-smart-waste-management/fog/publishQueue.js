"use strict";

const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// Self-draining async FIFO queue: publish() only enqueues a job while a single _pumping-guarded _pump() drains one job at a time so SQS sends are never concurrent.
let _client = null;
let _queueUrlPromise = null;
let _resolvedQueueUrl = null;
const _jobs = [];
let _pumping = false;

function configure(endpoint, region) {
  const config = { region };
  if (endpoint) {
    // LocalStack accepts any static credentials; real AWS issues temporary
    // ones (session token required) via the execution role, so this
    // override must not apply outside the LocalStack case.
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  _client = new SQSClient(config);
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
