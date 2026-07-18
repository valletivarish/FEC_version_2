import json
import random
import time
from contextlib import contextmanager
from dataclasses import dataclass
from itertools import islice

import boto3

INITIAL_BACKOFF_SECONDS = 0.25
MAX_BACKOFF_SECONDS = 4.0
BACKOFF_BUDGET_SECONDS = 60.0
JITTER_MAX_SECONDS = 0.1

# SendMessageBatch accepts at most this many entries per call.
SQS_BATCH_LIMIT = 10


def _chunked(items, size):
    it = iter(items)
    while chunk := list(islice(it, size)):
        yield chunk


def backoff_ticks(budget_seconds):
    """Yield once per attempt with growing+jittered delay until budget_seconds elapses."""
    deadline = time.monotonic() + budget_seconds
    delay = INITIAL_BACKOFF_SECONDS
    while True:
        yield
        if time.monotonic() >= deadline:
            return
        time.sleep(delay + random.uniform(0, JITTER_MAX_SECONDS))
        delay = min(delay * 2, MAX_BACKOFF_SECONDS)


@dataclass
class DepotEndpoint:
    endpoint_url: str
    region: str
    queue_name: str

    def build_client(self):
        return boto3.client("sqs", endpoint_url=self.endpoint_url, region_name=self.region)


class ShipmentLink:
    """Resolves the SQS queue URL once (retrying during provisioning) and reuses it per ship()."""

    def __init__(self, endpoint_url, region, queue_name):
        endpoint = DepotEndpoint(endpoint_url, region, queue_name)
        self._client = endpoint.build_client()
        self._queue_url = self._find_queue(endpoint.queue_name)

    def _find_queue(self, queue_name):
        # The queue may not exist yet at startup, so retry with backoff rather than fail fast.
        last_error = None
        for _ in backoff_ticks(BACKOFF_BUDGET_SECONDS):
            try:
                return self._client.get_queue_url(QueueName=queue_name)["QueueUrl"]
            except Exception as exc:
                last_error = exc
        raise RuntimeError(f"queue {queue_name} never became available") from last_error

    def ship(self, payload):
        self._client.send_message(QueueUrl=self._queue_url, MessageBody=json.dumps(payload))

    def ship_batch(self, payloads):
        """Ship a window's aggregates in one SendMessageBatch call per SQS_BATCH_LIMIT chunk."""
        for chunk in _chunked(payloads, SQS_BATCH_LIMIT):
            entries = [
                {"Id": str(index), "MessageBody": json.dumps(payload)}
                for index, payload in enumerate(chunk)
            ]
            self._client.send_message_batch(QueueUrl=self._queue_url, Entries=entries)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False


@contextmanager
def open_shipment_link(endpoint_url, region, queue_name):
    """Yield a connected ShipmentLink for the block; a single choke point for lifecycle changes."""
    link = ShipmentLink(endpoint_url, region, queue_name)
    with link:
        yield link
