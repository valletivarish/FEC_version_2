"""Fire-and-forget publish() submits send_message onto a dedicated single-worker ThreadPoolExecutor and returns the Future unwaited -- the 8th distinct publisher shape in this portfolio's Python projects."""

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
