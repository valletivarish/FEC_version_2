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


def retry_ticks(budget_seconds):
    """Yield once per attempt, sleeping with growing+jittered delay between
    attempts, until budget_seconds has elapsed. The caller breaks out of the
    loop (e.g. via return) as soon as an attempt succeeds."""
    deadline = time.monotonic() + budget_seconds
    delay = INITIAL_BACKOFF_SECONDS
    while True:
        yield
        if time.monotonic() >= deadline:
            return
        time.sleep(delay + random.uniform(0, JITTER_MAX_SECONDS))
        delay = min(delay * 2, MAX_BACKOFF_SECONDS)


@dataclass
class BrokerEndpoint:
    endpoint_url: str
    region: str
    queue_name: str

    def build_client(self):
        return boto3.client("sqs", endpoint_url=self.endpoint_url, region_name=self.region)


class ShipmentLink:
    """Resolves the SQS queue URL once (retrying while LocalStack finishes
    provisioning it) and reuses that URL for every subsequent ship() call, so
    steady-state publishing does not pay a lookup round-trip per message."""

    def __init__(self, endpoint_url, region, queue_name):
        endpoint = BrokerEndpoint(endpoint_url, region, queue_name)
        self._client = endpoint.build_client()
        self._queue_url = self._find_queue(endpoint.queue_name)

    def _find_queue(self, queue_name):
        # The queue may not exist yet at startup (LocalStack bootstrap and
        # this service can start in either order), so retry with backoff
        # instead of failing fast on the first lookup.
        last_error = None
        for _ in retry_ticks(BACKOFF_BUDGET_SECONDS):
            try:
                return self._client.get_queue_url(QueueName=queue_name)["QueueUrl"]
            except Exception as exc:
                last_error = exc
        raise RuntimeError(f"queue {queue_name} never became available") from last_error

    def ship(self, payload):
        self._client.send_message(QueueUrl=self._queue_url, MessageBody=json.dumps(payload))

    def ship_batch(self, payloads):
        """Ships a whole window's worth of aggregates in as few round-trips
        as possible: one SendMessageBatch call per SQS_BATCH_LIMIT-sized
        chunk, instead of one send_message call per payload."""
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
    """Context-manager factory: yields a connected ShipmentLink for the
    duration of the block. There is nothing to release on exit today, but
    routing construction through here keeps a single choke point for
    lifecycle changes (e.g. closing the underlying boto3 client) later."""
    link = ShipmentLink(endpoint_url, region, queue_name)
    with link:
        yield link
