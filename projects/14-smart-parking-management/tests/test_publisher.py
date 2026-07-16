"""make_publisher is a closure factory, not a class -- there is no
persistent object exposing _client/_queue_url attributes to monkeypatch
after construction. Tests instead replace the module's `boto3` reference
itself before calling make_publisher(), so the client the closure captures
is the fake one."""

import json
from types import SimpleNamespace

import pytest

from conftest import load_module

publisher = load_module("fog_publisher", "fog/publisher.py")


class FakeSqsClient:
    def __init__(self):
        self.get_queue_url_calls = 0
        self.sent = []
        self.batch_calls = []

    def get_queue_url(self, QueueName):
        self.get_queue_url_calls += 1
        return {"QueueUrl": f"http://queue/{QueueName}"}

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, MessageBody))

    def send_message_batch(self, QueueUrl, Entries):
        self.batch_calls.append((QueueUrl, Entries))


class FlakyThenOkSqsClient(FakeSqsClient):
    """Raises on the first get_queue_url call (simulating LocalStack not
    having provisioned the queue yet), then succeeds."""

    def get_queue_url(self, QueueName):
        self.get_queue_url_calls += 1
        if self.get_queue_url_calls == 1:
            raise RuntimeError("queue does not exist yet")
        return {"QueueUrl": f"http://queue/{QueueName}"}


class AlwaysFailsSqsClient(FakeSqsClient):
    def get_queue_url(self, QueueName):
        self.get_queue_url_calls += 1
        raise RuntimeError("queue never appears")


def fake_boto3(client):
    return SimpleNamespace(client=lambda service, endpoint_url=None, region_name=None: client)


class TestMakePublisher:
    def test_publish_sends_json_body_to_the_resolved_queue_url(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        publish = publisher.make_publisher("http://localstack:4566", "eu-west-1", "spm-lot-agg")
        publish({"a": 1})

        assert fake_client.sent == [("http://queue/spm-lot-agg", json.dumps({"a": 1}))]

    def test_queue_url_is_resolved_once_and_reused_across_publishes(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        publish = publisher.make_publisher("http://localstack:4566", "eu-west-1", "spm-lot-agg")
        publish({"a": 1})
        publish({"a": 2})

        assert fake_client.get_queue_url_calls == 1
        assert len(fake_client.sent) == 2

    def test_retries_the_queue_url_lookup_until_it_succeeds(self, monkeypatch):
        fake_client = FlakyThenOkSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        publish = publisher.make_publisher(
            "http://localstack:4566", "eu-west-1", "spm-lot-agg", attempts=5, retry_delay_seconds=0,
        )
        publish({"a": 1})

        assert fake_client.get_queue_url_calls == 2
        assert len(fake_client.sent) == 1

    def test_raises_after_exhausting_attempts(self, monkeypatch):
        fake_client = AlwaysFailsSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        with pytest.raises(RuntimeError):
            publisher.make_publisher(
                "http://localstack:4566", "eu-west-1", "spm-lot-agg", attempts=3, retry_delay_seconds=0,
            )

        assert fake_client.get_queue_url_calls == 3

    def test_each_call_to_make_publisher_returns_an_independent_closure(self, monkeypatch):
        client_a, client_b = FakeSqsClient(), FakeSqsClient()

        monkeypatch.setattr(publisher, "boto3", fake_boto3(client_a))
        publish_a = publisher.make_publisher("http://localstack:4566", "eu-west-1", "queue-a")

        monkeypatch.setattr(publisher, "boto3", fake_boto3(client_b))
        publish_b = publisher.make_publisher("http://localstack:4566", "eu-west-1", "queue-b")

        publish_a({"x": 1})
        publish_b({"x": 2})

        assert client_a.sent == [("http://queue/queue-a", json.dumps({"x": 1}))]
        assert client_b.sent == [("http://queue/queue-b", json.dumps({"x": 2}))]


class TestPublishBatch:
    def test_batch_under_the_limit_is_one_send_message_batch_call(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        publish = publisher.make_publisher("http://localstack:4566", "eu-west-1", "spm-lot-agg")
        publish.batch([{"a": 1}, {"a": 2}, {"a": 3}])

        assert len(fake_client.batch_calls) == 1
        queue_url, entries = fake_client.batch_calls[0]
        assert queue_url == "http://queue/spm-lot-agg"
        assert [json.loads(e["MessageBody"]) for e in entries] == [{"a": 1}, {"a": 2}, {"a": 3}]

    def test_batch_of_23_is_chunked_into_10_10_3(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        publish = publisher.make_publisher("http://localstack:4566", "eu-west-1", "spm-lot-agg")
        publish.batch([{"a": i} for i in range(23)])

        assert [len(entries) for _, entries in fake_client.batch_calls] == [10, 10, 3]

    def test_entry_ids_are_unique_within_each_chunk(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        publish = publisher.make_publisher("http://localstack:4566", "eu-west-1", "spm-lot-agg")
        publish.batch([{"a": i} for i in range(12)])

        for _, entries in fake_client.batch_calls:
            ids = [e["Id"] for e in entries]
            assert len(ids) == len(set(ids))

    def test_batch_reuses_the_already_resolved_queue_url(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        publish = publisher.make_publisher("http://localstack:4566", "eu-west-1", "spm-lot-agg")
        publish.batch([{"a": 1}])

        assert fake_client.get_queue_url_calls == 1

    def test_empty_batch_sends_no_requests(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "boto3", fake_boto3(fake_client))

        publish = publisher.make_publisher("http://localstack:4566", "eu-west-1", "spm-lot-agg")
        publish.batch([])

        assert fake_client.batch_calls == []
