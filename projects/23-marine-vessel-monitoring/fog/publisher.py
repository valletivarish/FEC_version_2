"""SQS publishing via a dedicated single-worker
concurrent.futures.ThreadPoolExecutor -- the 8th distinct publisher shape in
the portfolio's Python projects.

01's fog/publisher.py is a class (SqsPublisher) with a bounded sleep-retry
loop in __init__, caching the client/URL as instance state. 05's
fog/publisher.py is a @contextmanager factory (open_shipment_link) yielding
a dataclass-backed ShipmentLink with its own jittered-backoff retry
generator. 12's fog/publisher.py is a pair of functools.lru_cache-memoized
functions. 13's fog/publisher.py is a manual module-level singleton
(globals plus a get_client() function). 14's fog/publisher.py is a closure
factory (make_publisher) returning an inner publish(). 17's fog/publisher.py
runs a dedicated background thread draining a queue.SimpleQueue and
shipping up to 10 messages per call via send_message_batch. 21's
fog/publisher.py is a single stateless function, publish(client, queue_url,
payload), caching nothing and taking an already-built client/URL as
explicit parameters on every call.

Every one of those seven either blocks the caller until the real network
call returns, or hands the message to an explicit outbox queue that a
separate loop drains (in 17's case, in batches). This module does neither:
publish(message) submits client.send_message(...) as its own one-off task
directly onto a dedicated ThreadPoolExecutor(max_workers=1) and returns the
Future immediately without waiting on it -- fire-and-forget, one executor
task per message, no outbox queue object, no drain loop, no batching. The
executor's single worker thread still serialises every real network call
(so publish order is preserved per publisher), but the caller (fog/app.py's
flush(), driven by a Tornado PeriodicCallback) never blocks the IOLoop
waiting for SQS to answer.
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor

import boto3

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sqs-publisher")


def build_client(endpoint_url, region):
    return boto3.client("sqs", endpoint_url=endpoint_url, region_name=region)


def resolve_queue_url(client, queue_name, attempts=30, delay=2):
    """Startup-time bootstrapping: retry while LocalStack finishes
    provisioning the queue. Lives here (called once from fog/app.py's
    main()) rather than inside publish(), which stays a stateless per-call
    submission."""
    last_error = None
    for _ in range(attempts):
        try:
            return client.get_queue_url(QueueName=queue_name)["QueueUrl"]
        except Exception as exc:
            last_error = exc
            time.sleep(delay)
    raise RuntimeError(f"queue {queue_name} never became available") from last_error


def _send(client, queue_url, message):
    client.send_message(QueueUrl=queue_url, MessageBody=json.dumps(message))


def publish(client, queue_url, message, executor=None):
    """Fire-and-forget: submit the real send_message call onto the shared
    single-worker executor and return the Future without waiting on it.
    `executor` is only ever overridden in tests."""
    pool = executor or _executor
    return pool.submit(_send, client, queue_url, message)
