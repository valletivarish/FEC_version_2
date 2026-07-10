"""SQS publishing as a manual module-level singleton -- the 4th distinct
publisher shape across this portfolio's Python projects: 01's publisher.py
is a class (SqsPublisher) with a retry loop in __init__; 05's is a
contextlib.contextmanager factory (open_shipment_link) yielding a
dataclass-backed ShipmentLink; 12's is a pair of functools.lru_cache-
memoized functions. Here there is no decorator, no class, no context
manager -- just a private _client global and a get_client() function that
builds the boto3 client on first call and returns the cached instance on
every call after that, by hand.
"""

import json
import os
import time

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "ecn-hub-agg")

_client = None
_queue_url = None


def get_client():
    global _client
    if _client is None:
        _client = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)
    return _client


def get_queue_url():
    """Resolves and caches the queue URL with the same manual-global
    pattern as get_client(). A failed lookup (queue not provisioned yet)
    leaves _queue_url as None, so the next call simply tries again instead
    of caching a failure."""
    global _queue_url
    if _queue_url is None:
        _queue_url = get_client().get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]
    return _queue_url


def publish(message):
    """Send one window-aggregate message to SQS, retrying queue-url
    resolution with a fixed backoff while LocalStack finishes starting up."""
    last_error = None
    for _ in range(30):
        try:
            url = get_queue_url()
            get_client().send_message(QueueUrl=url, MessageBody=json.dumps(message))
            return
        except Exception as exc:
            last_error = exc
            time.sleep(2)
    raise RuntimeError(f"failed to publish to queue {QUEUE_NAME}") from last_error


def reset_client():
    """Test-only escape hatch: clears both manually-memoized globals so
    tests that install different fake clients don't leak state between
    each other."""
    global _client, _queue_url
    _client = None
    _queue_url = None
