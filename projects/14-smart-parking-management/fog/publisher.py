"""make_publisher builds a boto3 client and queue_url once, then closes over both in the returned publish() function -- the 4th distinct publisher shape (closure-based, not class/contextmanager/lru_cache) in this portfolio's Python projects. The returned publish() also carries a .batch attribute (a sibling closure over the same client/queue_url) so callers that flush several messages at once can send one SendMessageBatch call per 10-entry chunk instead of one SendMessage per message."""

import json
import time

import boto3


def make_publisher(endpoint_url, region, queue_name, attempts=30, retry_delay_seconds=2):
    """Build one SQS client and resolve queue_name to a queue URL (retrying
    with a fixed delay while LocalStack finishes provisioning it), then
    return a publish(message) closure that reuses both on every call."""
    client = boto3.client("sqs", endpoint_url=endpoint_url, region_name=region)

    queue_url = None
    last_error = None
    for _ in range(attempts):
        try:
            queue_url = client.get_queue_url(QueueName=queue_name)["QueueUrl"]
            break
        except Exception as exc:
            last_error = exc
            time.sleep(retry_delay_seconds)
    if queue_url is None:
        raise RuntimeError(f"queue {queue_name} never became available") from last_error

    def publish(message):
        client.send_message(QueueUrl=queue_url, MessageBody=json.dumps(message))

    def publish_batch(messages):
        """Ship every message in one SendMessageBatch call per 10-entry
        chunk (the hard API limit) instead of one SendMessage round trip
        per message. Entry Ids only need to be unique within their own
        chunk, so the position inside each chunk is reused as the Id."""
        for offset in range(0, len(messages), 10):
            chunk = messages[offset:offset + 10]
            entries = [{"Id": str(i), "MessageBody": json.dumps(m)} for i, m in enumerate(chunk)]
            client.send_message_batch(QueueUrl=queue_url, Entries=entries)

    publish.batch = publish_batch
    return publish
