"use strict";

const { Transform, Writable } = require("node:stream");
const { SQSClient, GetQueueUrlCommand, SendMessageCommand, SendMessageBatchCommand } = require("@aws-sdk/client-sqs");

const BATCH_LIMIT = 10;

// A real Node stream pipeline (Transform piped into a Writable SQS sink, publish() outcomes correlated via a Map<id,{resolve,reject}>) -- the 5th distinct fog-publisher idiom, after 03's class, 06's closure factory, 10's stateless function, and 11's frozen object literal.
class PassThroughGroup extends Transform {
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

// Recursive exponential-backoff retry (200ms, 400ms, 800ms, ... capped at
// 3s/attempt, 25 attempts total) rather than 11-water-treatment-utility's
// imperative for-loop with a fixed 2000ms delay between every attempt --
// LocalStack's queue is usually ready within a couple of attempts, so most
// resolutions here finish faster than the fixed-delay approach would allow,
// while still tolerating a genuinely slow cold start via the growing cap.
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

// Both entry points below funnel through this single private helper rather
// than duplicating the same four assignments twice (the pattern 11's
// configure()/useClient() pair uses) -- configure() is just useClient() with
// a freshly constructed SQSClient standing in for the injected client.
function _wireClient(client, queueName) {
  _client = client;
  _queueName = queueName;
  _queueUrlPromise = null;
  _resolvedQueueUrl = null;
  _wirePipeline();
  return module.exports;
}

// Static test/test credentials only make sense against LocalStack -- gating
// them on the presence of an explicit endpoint (rather than building them
// unconditionally) leaves the AWS SDK's own default credential chain
// (execution-role creds, session token included) in charge everywhere else.
function configure(endpoint, region, queueName) {
  const config = { region };
  if (endpoint) {
    config.endpoint = endpoint;
    config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  return _wireClient(new SQSClient(config), queueName);
}

// Test seam: inject a hand-written fake client ({ send: async (cmd) => ... })
// instead of a real SQSClient, still exercising the real Transform/Writable
// stream pipeline underneath.
function useClient(client, queueName = "test-queue") {
  return _wireClient(client, queueName);
}

function _wirePipeline() {
  const transform = new PassThroughGroup();
  const sink = buildSqsSink();
  transform.pipe(sink);
  _pipeline = { transform, sink };
}

function publish(group) {
  // Always returns a Promise -- even the "not configured" failure is a
  // rejection, never a synchronous throw, so callers can uniformly
  // await/catch publish() regardless of which failure mode occurs.
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

// Flush-time counterpart to publish(): a window close can seal several
// (sensor_type, site_id) groups at once, and sending each through its own
// SendMessageCommand wastes an API call per group. This chunks the whole
// batch at SendMessageBatch's 10-entry limit and issues one call per chunk,
// bypassing the single-item Transform/Writable pipeline entirely since that
// plumbing exists to correlate one publish() caller with one send outcome,
// not to shape a many-groups-per-call request.
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
