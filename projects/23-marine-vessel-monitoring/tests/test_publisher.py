import json
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from conftest import load_module

publisher = load_module("mvs_fog_publisher", "fog/publisher.py")


class FakeSqsClient:
    def __init__(self):
        self.sent = []
        self.batch_calls = []

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, json.loads(MessageBody)))

    def send_message_batch(self, QueueUrl, Entries):
        self.batch_calls.append(len(Entries))
        for entry in Entries:
            self.sent.append((QueueUrl, json.loads(entry["MessageBody"])))


class FlakyThenOkClient:
    def __init__(self, fail_times):
        self.attempts = 0
        self.fail_times = fail_times

    def get_queue_url(self, QueueName):
        self.attempts += 1
        if self.attempts <= self.fail_times:
            raise RuntimeError("queue not provisioned yet")
        return {"QueueUrl": "http://queue-url"}


def test_resolve_queue_url_retries_until_success():
    client = FlakyThenOkClient(fail_times=2)
    url = publisher.resolve_queue_url(client, "mvs-vessel-agg", attempts=5, delay=0)
    assert url == "http://queue-url"
    assert client.attempts == 3


def test_resolve_queue_url_raises_after_exhausting_attempts():
    client = FlakyThenOkClient(fail_times=10)
    with pytest.raises(RuntimeError):
        publisher.resolve_queue_url(client, "mvs-vessel-agg", attempts=3, delay=0)


def test_publish_returns_a_future_immediately_fire_and_forget():
    """The slow fake client proves publish() does not block the caller --
    it returns well before the (artificially slowed) send_message call
    could possibly have completed."""

    class SlowClient:
        def send_message(self, QueueUrl, MessageBody):
            time.sleep(0.3)

    executor = ThreadPoolExecutor(max_workers=1)
    started = time.monotonic()
    future = publisher.publish(SlowClient(), "http://queue-url", {"a": 1}, executor=executor)
    elapsed = time.monotonic() - started
    assert elapsed < 0.1, "publish() should return immediately, not block on the network call"
    future.result(timeout=2)  # let the slow call actually finish before the test exits
    executor.shutdown(wait=True)


def test_publish_eventually_sends_the_message():
    client = FakeSqsClient()
    executor = ThreadPoolExecutor(max_workers=1)
    future = publisher.publish(client, "http://queue-url", {"site_id": "vessel-a"}, executor=executor)
    future.result(timeout=2)
    assert client.sent == [("http://queue-url", {"site_id": "vessel-a"})]
    executor.shutdown(wait=True)


def test_single_worker_executor_serialises_multiple_publishes():
    """Two messages submitted back-to-back must both land, in submission
    order, since the shared executor has exactly one worker thread."""
    client = FakeSqsClient()
    executor = ThreadPoolExecutor(max_workers=1)
    futures = [
        publisher.publish(client, "http://queue-url", {"n": i}, executor=executor)
        for i in range(5)
    ]
    for future in futures:
        future.result(timeout=2)
    assert [msg["n"] for _url, msg in client.sent] == [0, 1, 2, 3, 4]
    executor.shutdown(wait=True)


def test_publish_batch_chunks_at_ten_entries():
    client = FakeSqsClient()
    executor = ThreadPoolExecutor(max_workers=1)
    messages = [{"n": i} for i in range(23)]
    futures = publisher.publish_batch(client, "http://queue-url", messages, executor=executor)
    for future in futures:
        future.result(timeout=2)
    assert client.batch_calls == [10, 10, 3]
    assert [msg["n"] for _url, msg in client.sent] == list(range(23))
    executor.shutdown(wait=True)


def test_publish_batch_is_fire_and_forget():
    class SlowClient:
        def send_message_batch(self, QueueUrl, Entries):
            time.sleep(0.3)

    executor = ThreadPoolExecutor(max_workers=1)
    started = time.monotonic()
    futures = publisher.publish_batch(SlowClient(), "http://queue-url", [{"a": 1}], executor=executor)
    elapsed = time.monotonic() - started
    assert elapsed < 0.1, "publish_batch() should return immediately, not block on the network call"
    for future in futures:
        future.result(timeout=2)
    executor.shutdown(wait=True)


def test_publish_batch_empty_list_sends_nothing():
    client = FakeSqsClient()
    executor = ThreadPoolExecutor(max_workers=1)
    futures = publisher.publish_batch(client, "http://queue-url", [], executor=executor)
    assert futures == []
    executor.shutdown(wait=True)


def test_build_client_uses_boto3_sqs(monkeypatch):
    calls = []

    class FakeBoto3:
        @staticmethod
        def client(service, endpoint_url=None, region_name=None):
            calls.append((service, endpoint_url, region_name))
            return "a-client"

    monkeypatch.setattr(publisher, "boto3", FakeBoto3)
    client = publisher.build_client("http://localhost:4588", "eu-west-1")
    assert client == "a-client"
    assert calls == [("sqs", "http://localhost:4588", "eu-west-1")]
