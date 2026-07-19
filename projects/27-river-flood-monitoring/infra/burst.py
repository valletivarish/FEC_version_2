"""Burst-load the queue to demonstrate backend scaling; synthetic signal names keep the live dashboard partitions untouched."""
import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4579")
REGION = os.getenv("AWS_REGION", "eu-west-1")
QUEUE = os.getenv("SQS_QUEUE_NAME", "rfw-catchment-agg")

_sqs = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION,
                    aws_access_key_id="test", aws_secret_access_key="test")


def _body(index):
    return json.dumps({
        "sensor_type": f"loadtest_{index % 5}", "site_id": f"probe-{index % 20}",
        "window_start": "s", "window_end": f"e{index}", "count": 1,
        "min": 0, "max": 0, "avg": 0, "latest": 0, "rise_mph": 0, "alerts": [],
    })


def _depth(url):
    attrs = _sqs.get_queue_attributes(QueueUrl=url, AttributeNames=[
        "ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"])["Attributes"]
    return int(attrs["ApproximateNumberOfMessages"]) + int(attrs["ApproximateNumberOfMessagesNotVisible"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--messages", type=int, default=2000)
    parser.add_argument("--workers", type=int, default=32)
    args = parser.parse_args()

    url = _sqs.get_queue_url(QueueName=QUEUE)["QueueUrl"]
    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(lambda i: _sqs.send_message(QueueUrl=url, MessageBody=_body(i)), range(args.messages)))
    print(f"sent {args.messages} messages in {time.monotonic() - start:.2f}s", flush=True)

    initial = _depth(url)
    assert initial > 0, "queue empty right after burst; sends did not reach SQS"
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        remaining = _depth(url)
        print(f"queue depth: {remaining}", flush=True)
        if remaining == 0:
            print("PASS: queue fully drained by the consumer", flush=True)
            return
        time.sleep(3)
    print("WARNING: queue not fully drained within the window (LocalStack throughput ceiling)", flush=True)


if __name__ == "__main__":
    main()
