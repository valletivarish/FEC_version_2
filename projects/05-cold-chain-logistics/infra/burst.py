import argparse
import itertools
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4570")
REGION = os.getenv("AWS_REGION", "eu-west-1")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "fcl-manifest-agg")

# Synthetic type names distinct from the 5 real reading types, so burst traffic stays out of live partitions.
LOAD_TYPES = ["loadtest_a", "loadtest_b", "loadtest_c", "loadtest_d", "loadtest_e"]

BASE = datetime.now(timezone.utc)

SQS_BATCH_LIMIT = 10


@dataclass
class SyntheticAggregate:
    sensor_type: str
    site_id: str
    unit: str
    window_start: str
    window_end: str
    count: int
    min: float
    max: float
    avg: float
    latest: float
    alerts: list


def build_payload(i, reading_type):
    end = BASE + timedelta(milliseconds=i)
    window = SyntheticAggregate(
        sensor_type=reading_type,
        site_id=f"load-{i % 50}",
        unit="x",
        window_start=(end - timedelta(seconds=10)).isoformat(),
        window_end=end.isoformat(),
        count=5,
        min=1.0,
        max=9.0,
        avg=5.0,
        latest=5.0,
        alerts=[],
    )
    return asdict(window)


def chunked(iterable, size):
    it = iter(iterable)
    while chunk := list(itertools.islice(it, size)):
        yield chunk


def to_batch_entries(items):
    entries = []
    for i, reading_type in items:
        entries.append({
            "Id": str(i % SQS_BATCH_LIMIT),
            "MessageBody": json.dumps(build_payload(i, reading_type)),
        })
    return entries


def send_one_batch(sqs, queue_url, items):
    resp = sqs.send_message_batch(QueueUrl=queue_url, Entries=to_batch_entries(items))
    failed = resp.get("Failed") or []
    if failed:
        raise RuntimeError(f"send_message_batch reported failures: {failed}")
    return len(resp.get("Successful", items))


def fire_burst(sqs, queue_url, total_messages, workers, report_stride=10):
    type_cycle = itertools.cycle(LOAD_TYPES)
    indices = ((i, next(type_cycle)) for i in range(total_messages))
    report_every = max(total_messages // report_stride, 1)
    batches = list(chunked(indices, SQS_BATCH_LIMIT))
    sent = 0

    dispatch = lambda batch: send_one_batch(sqs, queue_url, batch)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for batch, batch_sent in zip(batches, pool.map(dispatch, batches)):
            sent += batch_sent
            crossed_checkpoint = sent // report_every != (sent - len(batch)) // report_every
            if crossed_checkpoint or sent == total_messages:
                print(f"progress: {sent}/{total_messages} sent", flush=True)
    return sent


@dataclass
class BurstPlan:
    messages: int
    workers: int

    @classmethod
    def from_args(cls, argv=None):
        parser = argparse.ArgumentParser(description="Burst-load the backend queue to demonstrate scaling.")
        parser.add_argument("--messages", type=int, default=2000)
        parser.add_argument("--workers", type=int, default=32)
        args = parser.parse_args(argv)
        return cls(messages=args.messages, workers=args.workers)


@dataclass
class BurstResult:
    plan: BurstPlan
    sent: int
    elapsed_seconds: float
    queue_depth: dict

    @property
    def throughput(self):
        return self.sent / self.elapsed_seconds if self.elapsed_seconds else 0.0


def format_report(result):
    lines = [
        f"sent {result.sent} messages in {result.elapsed_seconds:.2f}s ({result.throughput:.0f} msg/s)",
        f"queue depth after burst: {result.queue_depth}",
    ]
    return "\n".join(lines)


def run_burst(plan):
    sqs = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)
    queue_url = sqs.get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]

    start = time.monotonic()
    sent = fire_burst(sqs, queue_url, plan.messages, plan.workers)
    elapsed = time.monotonic() - start

    queue_depth = sqs.get_queue_attributes(
        QueueUrl=queue_url,
        AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
    )["Attributes"]

    return BurstResult(plan=plan, sent=sent, elapsed_seconds=elapsed, queue_depth=queue_depth)


def main():
    plan = BurstPlan.from_args()
    result = run_burst(plan)
    print(format_report(result))


if __name__ == "__main__":
    main()
