"use strict";

const { Transform, Writable } = require("node:stream");
const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");

// A real Node stream pipeline, not a class instance (03), a closure factory
// (06), a stateless function taking the client per-call (10), or a frozen
// object literal (11). Aggregated window groups are .write()-en into
// PassThroughGroup, an objectMode stream.Transform whose _transform simply
// forwards the payload on with this.push() -- a genuine passthrough stage,
// kept separate from the sink so a future project could insert real
// transform logic (e.g. redaction, enrichment) between ingestion and send
// without touching the sink at all. The Transform is piped into an
// objectMode stream.Writable (buildSqsSink) whose _write performs the
// actual SendMessageCommand against SQS.
//
// Because .pipe() only guarantees the Transform accepted a chunk into its
// own internal buffer, not that the Writable finished sending it, publish()
// below correlates each write with its eventual outcome via a small
// Map<id, {resolve, reject}> keyed by a monotonic id stamped onto the
// chunk before writing -- the sink looks the id up once its SQS send
// settles and resolves/rejects the matching publish() promise. The sink
// itself always calls its stream callback with no argument (never
// callback(err)), because propagating an error through the stream would
// destroy the Writable and take every future publish() down with it; a
// single failed send should only fail that one caller's promise.
//
// The surrounding queue-url-resolution/config scaffolding is also written
// distinctly from 11's version rather than only renamed: resolveQueueUrl()
// below is a recursive exponential backoff (200ms doubling, capped at 3s)
// instead of 11's imperative for-loop with a fixed 2000ms delay between
// every attempt, and configure()/useClient() both funnel through one
// private _wireClient() helper instead of duplicating the same four
// assignments in each function body.
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

function configure(endpoint, region, queueName) {
  return _wireClient(
    new SQSClient({ endpoint, region, credentials: { accessKeyId: "test", secretAccessKey: "test" } }),
    queueName
  );
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
  reset,
  get queueUrl() {
    return _resolvedQueueUrl;
  },
};
