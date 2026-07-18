"""SQS publishing as a pair of lru_cache-memoized functions wrapping a plain boto3 client; a failing call is never cached, so _queue_url keeps retrying until the queue exists then stays resolved."""

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
    """Ship a whole flush window in as few SendMessageBatch calls as possible, chunked at the API's hard limit of 10 entries per call."""
    if not messages:
        return
    url = _queue_url(endpoint_url, region, queue_name)
    client = _client(endpoint_url, region)
    for offset in range(0, len(messages), 10):
        chunk = messages[offset:offset + 10]
        entries = [{"Id": str(i), "MessageBody": json.dumps(msg)} for i, msg in enumerate(chunk)]
        client.send_message_batch(QueueUrl=url, Entries=entries)


def reset_cache():
    """Test-only escape hatch: clear the memoized client/queue-url state between tests that point at different fakes."""
    _client.cache_clear()
    _queue_url.cache_clear()
