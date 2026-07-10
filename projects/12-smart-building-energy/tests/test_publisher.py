import json

import pytest

from conftest import load_module

publisher = load_module("fog_publisher", "fog/publisher.py")


class FakeSqsClient:
    def __init__(self):
        self.get_queue_url_calls = 0
        self.sent = []

    def get_queue_url(self, QueueName):
        self.get_queue_url_calls += 1
        return {"QueueUrl": f"http://queue/{QueueName}"}

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, MessageBody))


class FlakyThenOkSqsClient(FakeSqsClient):
    """Raises on the first get_queue_url call (simulating LocalStack not
    having provisioned the queue yet), then succeeds."""

    def get_queue_url(self, QueueName):
        self.get_queue_url_calls += 1
        if self.get_queue_url_calls == 1:
            raise RuntimeError("queue does not exist yet")
        return {"QueueUrl": f"http://queue/{QueueName}"}


@pytest.fixture(autouse=True)
def clear_cache():
    publisher.reset_cache()
    yield
    publisher.reset_cache()


class TestPublish:
    def test_publish_sends_json_body_to_resolved_queue_url(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "_client", lambda endpoint_url, region: fake_client)
        # _queue_url is itself lru_cache-wrapped and calls the (now patched)
        # _client, so clearing it lets the patched client take effect.
        publisher._queue_url.cache_clear()

        publisher.publish("http://localstack:4566", "eu-west-1", "sbe-floor-agg", {"a": 1})

        assert fake_client.sent == [("http://queue/sbe-floor-agg", json.dumps({"a": 1}))]

    def test_queue_url_is_memoized_after_first_success(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "_client", lambda endpoint_url, region: fake_client)
        publisher._queue_url.cache_clear()

        publisher.publish("http://localstack:4566", "eu-west-1", "sbe-floor-agg", {"a": 1})
        publisher.publish("http://localstack:4566", "eu-west-1", "sbe-floor-agg", {"a": 2})

        assert fake_client.get_queue_url_calls == 1
        assert len(fake_client.sent) == 2

    def test_a_failed_resolution_is_not_cached_so_the_next_publish_retries(self, monkeypatch):
        fake_client = FlakyThenOkSqsClient()
        monkeypatch.setattr(publisher, "_client", lambda endpoint_url, region: fake_client)
        publisher._queue_url.cache_clear()

        with pytest.raises(RuntimeError):
            publisher.publish("http://localstack:4566", "eu-west-1", "sbe-floor-agg", {"a": 1})

        publisher.publish("http://localstack:4566", "eu-west-1", "sbe-floor-agg", {"a": 1})
        assert fake_client.get_queue_url_calls == 2
        assert len(fake_client.sent) == 1
