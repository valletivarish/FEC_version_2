"""make_publisher builds a boto3 client and queue_url once, then closes over both in the returned publish() function -- the 4th distinct publisher shape (closure-based, not class/contextmanager/lru_cache) in this portfolio's Python projects."""

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

    return publish
