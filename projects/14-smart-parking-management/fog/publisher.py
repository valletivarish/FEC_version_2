"""SQS publishing as a closure factory: make_publisher(...) constructs one
boto3 client and resolves the queue URL once, both captured as closure
variables over a returned inner publish(message) function -- the 4th
distinct publisher shape in the portfolio's Python projects, and closure-
based memoization rather than any of the other three.

01's fog/publisher.py is a class (SqsPublisher) with a bounded sleep-based
retry loop in __init__. 05's fog/publisher.py is a
contextlib.contextmanager factory (open_shipment_link) yielding a
ShipmentLink dataclass-backed object with its own jittered-backoff retry
generator. 12's fog/publisher.py is a pair of functools.lru_cache-memoized
module-level functions wrapping a bare boto3.client.

Here there is no class, no contextmanager, and no lru_cache/global-variable
memoization: make_publisher does the client construction and the queue-url
retry loop itself, then closes over both in the tiny inner publish()
function it returns. The closure is the only place that state lives --
nothing is stored on self, in a module global, or in a cache dict.
"""

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
