"""SQS publishing as a pair of functools.lru_cache-memoized functions wrapping
a plain boto3.client, rather than a class (01's SqsPublisher) or a
contextlib.contextmanager-based session object (05's open_shipment_link).

lru_cache only memoizes calls that return normally -- a call that raises is
never cached -- so _queue_url naturally keeps retrying on every publish()
until LocalStack has finished provisioning the queue, then stays resolved
for the rest of the process lifetime without an explicit retry loop.
"""

import functools
import json

import boto3


@functools.lru_cache(maxsize=None)
def _client(endpoint_url, region):
    return boto3.client("sqs", endpoint_url=endpoint_url, region_name=region)


@functools.lru_cache(maxsize=None)
def _queue_url(endpoint_url, region, queue_name):
    return _client(endpoint_url, region).get_queue_url(QueueName=queue_name)["QueueUrl"]


def publish(endpoint_url, region, queue_name, message):
    url = _queue_url(endpoint_url, region, queue_name)
    _client(endpoint_url, region).send_message(QueueUrl=url, MessageBody=json.dumps(message))


def publish_batch(endpoint_url, region, queue_name, messages):
    """Ship every message from one flush window in as few SendMessageBatch
    calls as possible instead of one send_message() round trip per message
    -- chunked at 10 entries since that's the hard limit SendMessageBatch
    itself imposes per call."""
    if not messages:
        return
    url = _queue_url(endpoint_url, region, queue_name)
    client = _client(endpoint_url, region)
    for offset in range(0, len(messages), 10):
        chunk = messages[offset:offset + 10]
        entries = [{"Id": str(i), "MessageBody": json.dumps(msg)} for i, msg in enumerate(chunk)]
        client.send_message_batch(QueueUrl=url, Entries=entries)


def reset_cache():
    """Test-only escape hatch: lru_cache state would otherwise leak a stale
    boto3 client/queue url between tests that point at different fake
    clients or endpoints."""
    _client.cache_clear()
    _queue_url.cache_clear()
