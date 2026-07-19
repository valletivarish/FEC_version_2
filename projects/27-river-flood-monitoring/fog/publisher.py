"""Blocking SQS publisher (boto3), driven from the async flush via asyncio.to_thread."""
import json
import time

import boto3

_client = None
_queue_url = None


def configure(endpoint_url, region, queue_name):
    global _client, _queue_url
    _client = boto3.client("sqs", endpoint_url=endpoint_url, region_name=region)
    for _ in range(30):
        try:
            _queue_url = _client.get_queue_url(QueueName=queue_name)["QueueUrl"]
            return
        except Exception:
            time.sleep(2)
    raise RuntimeError(f"queue {queue_name} never appeared")


def send_window(messages):
    if not messages:
        return
    for offset in range(0, len(messages), 10):
        chunk = messages[offset:offset + 10]
        entries = [{"Id": str(i), "MessageBody": json.dumps(m)} for i, m in enumerate(chunk)]
        _client.send_message_batch(QueueUrl=_queue_url, Entries=entries)
