import json

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
    """Raises on the first get_queue_url call (queue not provisioned yet), then succeeds."""

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
        # _queue_url is lru_cache-wrapped and calls the now-patched _client, so clear it to let the patch take effect.
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


class TestPublishBatch:
    def test_empty_message_list_sends_nothing(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "_client", lambda endpoint_url, region: fake_client)
        publisher._queue_url.cache_clear()

        publisher.publish_batch("http://localstack:4566", "eu-west-1", "sbe-floor-agg", [])

        assert fake_client.batch_calls == []
        assert fake_client.get_queue_url_calls == 0

    def test_a_handful_of_messages_go_out_in_a_single_batch_call(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "_client", lambda endpoint_url, region: fake_client)
        publisher._queue_url.cache_clear()
        messages = [{"a": i} for i in range(3)]

        publisher.publish_batch("http://localstack:4566", "eu-west-1", "sbe-floor-agg", messages)

        assert len(fake_client.batch_calls) == 1
        url, entries = fake_client.batch_calls[0]
        assert url == "http://queue/sbe-floor-agg"
        assert [json.loads(e["MessageBody"]) for e in entries] == messages
        assert [e["Id"] for e in entries] == ["0", "1", "2"]

    def test_more_than_ten_messages_are_chunked_across_multiple_batch_calls(self, monkeypatch):
        fake_client = FakeSqsClient()
        monkeypatch.setattr(publisher, "_client", lambda endpoint_url, region: fake_client)
        publisher._queue_url.cache_clear()
        messages = [{"a": i} for i in range(23)]

        publisher.publish_batch("http://localstack:4566", "eu-west-1", "sbe-floor-agg", messages)

        assert [len(entries) for _, entries in fake_client.batch_calls] == [10, 10, 3]
        sent_total = sum(json.loads(e["MessageBody"])["a"] for _, entries in fake_client.batch_calls for e in entries)
        assert sent_total == sum(m["a"] for m in messages)
        # get_queue_url is lru_cache-memoized, so three chunked batch calls still resolve the queue URL only once.
        assert fake_client.get_queue_url_calls == 1
