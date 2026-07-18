"""make_publisher closes a boto3 client and queue_url into a publish() function that also carries a .batch sibling for SendMessageBatch."""

import json
import time

import boto3


def make_publisher(endpoint_url, region, queue_name, attempts=30, retry_delay_seconds=2):
    """Resolve queue_name to a URL (retrying while it provisions) and return a publish(message) closure that reuses both."""
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
        """One SendMessageBatch per 10-entry chunk (the API limit); each entry's Id is its position within the chunk."""
        for offset in range(0, len(messages), 10):
            chunk = messages[offset:offset + 10]
            entries = [{"Id": str(i), "MessageBody": json.dumps(m)} for i, m in enumerate(chunk)]
            client.send_message_batch(QueueUrl=queue_url, Entries=entries)

    publish.batch = publish_batch
    return publish
