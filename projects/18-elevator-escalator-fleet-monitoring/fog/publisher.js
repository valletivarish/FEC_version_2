"use strict";

const { Transform, Writable } = require("node:stream");
const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

const BATCH_LIMIT = 10;

// A real Node stream pipeline: a Transform piped into a Writable SQS sink, with publish() outcomes correlated by id.
class CarGroupRelay extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  _transform(chunk, encoding, callback) {
    this.push(chunk);
    callback();
  }
}

let _client = null;
let _queueName = null;
let _queueUrlPromise = null;
let _resolvedQueueUrl = null;
let _pipeline = null;
let _seq = 0;
const _pending = new Map();

// Recursive exponential-backoff retry (200ms doubling, capped at 3s/attempt, 25 attempts) for a slow queue cold start.
function resolveQueueUrl(maxAttempts = 25) {
  if (_queueUrlPromise) return _queueUrlPromise;

  const attemptLookup = (attempt) =>
    _client.send(new GetQueueUrlCommand({ QueueName: _queueName })).then(
      ({ QueueUrl }) => {
        _resolvedQueueUrl = QueueUrl;
        return QueueUrl;
      },
      (err) => {
        if (attempt >= maxAttempts) {
          _queueUrlPromise = null;
          throw new Error(`queue ${_queueName} still unreachable after ${attempt} attempts: ${err.message}`);
        }
        const backoffMs = Math.min(200 * 2 ** (attempt - 1), 3000);
        return new Promise((resolve) => setTimeout(resolve, backoffMs)).then(() => attemptLookup(attempt + 1));
      }
    );

  _queueUrlPromise = attemptLookup(1);
  return _queueUrlPromise;
}

function buildSqsSink() {
  return new Writable({
    objectMode: true,
    write(chunk, encoding, callback) {
      const { __publishId, ...payload } = chunk;
      const pending = _pending.get(__publishId);
      resolveQueueUrl()
        .then((queueUrl) => _client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(payload) })))
        .then(() => {
          _pending.delete(__publishId);
          if (pending) pending.resolve();
          callback();
        })
        .catch((err) => {
          _pending.delete(__publishId);
          if (pending) pending.reject(err);
          callback();
        });
    },
  });
}

// Shared wiring for both entry points; configure() supplies a real SQSClient, useClient() an injected one.
function _wireClient(client, queueName) {
  _client = client;
  _queueName = queueName;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
  _wirePipeline();
  return module.exports;
}

// Static test/test credentials are gated on an explicit endpoint (LocalStack) so the SDK default chain runs elsewhere.
function configure(endpoint, region, queueName) {
  const config = { region };
  if (endpoint) {
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  return _wireClient(new SQSClient(config), queueName);
}

// Test seam: inject a fake client while still exercising the real Transform/Writable pipeline.
function useClient(client, queueName = "test-queue") {
  return _wireClient(client, queueName);
}

function _wirePipeline() {
  const transform = new CarGroupRelay();
  const sink = buildSqsSink();
  transform.pipe(sink);
  _pipeline = { transform, sink };
}

function publish(group) {
  // Always returns a Promise; even the not-configured failure is a rejection, never a synchronous throw.
  return new Promise((resolve, reject) => {
    if (!_pipeline) {
      return reject(new Error("publisher pipeline not configured -- call configure() or useClient() first"));
    }
    _seq += 1;
    const id = _seq;
    _pending.set(id, { resolve, reject });
    _pipeline.transform.write({ ...group, __publishId: id });
  });
}

// Flush-time batch send: chunks the sealed groups at SendMessageBatch's 10-entry limit, bypassing the single-item pipeline.
async function publishBatch(groups) {
  if (groups.length === 0) return;
  if (!_client) {
    throw new Error("publisher pipeline not configured -- call configure() or useClient() first");
  }
  const queueUrl = await resolveQueueUrl();
  for (let offset = 0; offset < groups.length; offset += BATCH_LIMIT) {
    const chunk = groups.slice(offset, offset + BATCH_LIMIT);
    await _client.send(new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: chunk.map((group, i) => ({ Id: String(offset + i), MessageBody: JSON.stringify(group) })),
    }));
  }
}

function reset() {
  _client = null;
  _queueName = null;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
  _pipeline = null;
  _pending.clear();
}

module.exports = {
  configure,
  useClient,
  publish,
  publishBatch,
  reset,
  get queueUrl() {
    return _resolvedQueueUrl;
  },
};
