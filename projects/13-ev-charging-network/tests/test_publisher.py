"""publisher.py's manual _client global + get_client() function is the
portfolio's 4th distinct SQS-publisher shape (see the module docstring in
fog/publisher.py). These tests exercise the caching by hand -- there is no
lru_cache/class/contextmanager to defer to -- against a fake boto3 module,
never real AWS or LocalStack.
"""

import json

import pytest

from conftest import load_module

publisher = load_module("fog_publisher", "fog/publisher.py")


class FakeSqsClient:
    def __init__(self, fail_first_lookup=False):
        self.get_queue_url_calls = 0
        self.sent = []
        self.batches = []
        self._fail_first_lookup = fail_first_lookup

    def get_queue_url(self, QueueName):
        self.get_queue_url_calls += 1
        if self._fail_first_lookup and self.get_queue_url_calls == 1:
            raise RuntimeError("queue does not exist yet")
        return {"QueueUrl": f"http://queue/{QueueName}"}

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, MessageBody))

    def send_message_batch(self, QueueUrl, Entries):
        self.batches.append((QueueUrl, Entries))


@pytest.fixture(autouse=True)
def clear_singleton():
    publisher.reset_client()
    yield
    publisher.reset_client()


def install_fake_boto3(monkeypatch, fake_client, client_calls):
    def fake_boto3_client(service, endpoint_url, region_name):
        client_calls.append(service)
        return fake_client

    monkeypatch.setattr(publisher.boto3, "client", fake_boto3_client)


class TestGetClient:
    def test_builds_the_client_once_and_caches_it(self, monkeypatch):
        fake_client = FakeSqsClient()
        client_calls = []
        install_fake_boto3(monkeypatch, fake_client, client_calls)

        first = publisher.get_client()
        second = publisher.get_client()

        assert first is second is fake_client
        assert client_calls == ["sqs"]


class TestGetQueueUrl:
    def test_resolves_once_and_caches_the_url(self, monkeypatch):
        fake_client = FakeSqsClient()
        install_fake_boto3(monkeypatch, fake_client, [])

        first = publisher.get_queue_url()
        second = publisher.get_queue_url()

        assert first == second == f"http://queue/{publisher.QUEUE_NAME}"
        assert fake_client.get_queue_url_calls == 1


class TestPublish:
    def test_publish_sends_json_body_to_the_resolved_queue_url(self, monkeypatch):
        fake_client = FakeSqsClient()
        install_fake_boto3(monkeypatch, fake_client, [])

        publisher.publish({"a": 1})

        assert fake_client.sent == [(f"http://queue/{publisher.QUEUE_NAME}", json.dumps({"a": 1}))]

    def test_a_failed_queue_url_lookup_is_retried_on_the_next_publish_call(self, monkeypatch):
        monkeypatch.setattr(publisher.time, "sleep", lambda seconds: None)
        fake_client = FakeSqsClient(fail_first_lookup=True)
        install_fake_boto3(monkeypatch, fake_client, [])

        publisher.publish({"a": 1})

        assert fake_client.get_queue_url_calls == 2
        assert len(fake_client.sent) == 1

    def test_publish_gives_up_after_the_retry_budget_is_exhausted(self, monkeypatch):
        monkeypatch.setattr(publisher.time, "sleep", lambda seconds: None)

        class AlwaysFailingSqsClient(FakeSqsClient):
            def get_queue_url(self, QueueName):
                self.get_queue_url_calls += 1
                raise RuntimeError("queue never provisioned")

        fake_client = AlwaysFailingSqsClient()
        install_fake_boto3(monkeypatch, fake_client, [])

        with pytest.raises(RuntimeError):
            publisher.publish({"a": 1})


class TestPublishBatch:
    def test_sends_all_messages_in_one_call_under_the_ten_entry_limit(self, monkeypatch):
        fake_client = FakeSqsClient()
        install_fake_boto3(monkeypatch, fake_client, [])

        publisher.publish_batch([{"a": 1}, {"a": 2}, {"a": 3}])

        assert len(fake_client.batches) == 1
        url, entries = fake_client.batches[0]
        assert url == f"http://queue/{publisher.QUEUE_NAME}"
        assert [json.loads(e["MessageBody"]) for e in entries] == [{"a": 1}, {"a": 2}, {"a": 3}]
        assert [e["Id"] for e in entries] == ["0", "1", "2"]

    def test_chunks_at_the_ten_entry_send_message_batch_limit(self, monkeypatch):
        fake_client = FakeSqsClient()
        install_fake_boto3(monkeypatch, fake_client, [])

        publisher.publish_batch([{"n": i} for i in range(23)])

        assert [len(entries) for _, entries in fake_client.batches] == [10, 10, 3]

    def test_empty_list_is_a_no_op(self, monkeypatch):
        fake_client = FakeSqsClient()
        install_fake_boto3(monkeypatch, fake_client, [])

        publisher.publish_batch([])

        assert fake_client.batches == []

    def test_a_failed_chunk_send_is_retried(self, monkeypatch):
        monkeypatch.setattr(publisher.time, "sleep", lambda seconds: None)

        class FlakyOnFirstBatch(FakeSqsClient):
            def __init__(self):
                super().__init__()
                self.batch_attempts = 0

            def send_message_batch(self, QueueUrl, Entries):
                self.batch_attempts += 1
                if self.batch_attempts == 1:
                    raise RuntimeError("throttled")
                super().send_message_batch(QueueUrl, Entries)

        fake_client = FlakyOnFirstBatch()
        install_fake_boto3(monkeypatch, fake_client, [])

        publisher.publish_batch([{"a": 1}])

        assert fake_client.batch_attempts == 2
        assert len(fake_client.batches) == 1

    def test_gives_up_after_the_retry_budget_is_exhausted(self, monkeypatch):
        monkeypatch.setattr(publisher.time, "sleep", lambda seconds: None)

        class AlwaysFailingBatchClient(FakeSqsClient):
            def send_message_batch(self, QueueUrl, Entries):
                raise RuntimeError("queue never provisioned")

        fake_client = AlwaysFailingBatchClient()
        install_fake_boto3(monkeypatch, fake_client, [])

        with pytest.raises(RuntimeError):
            publisher.publish_batch([{"a": 1}])


class TestResetClient:
    def test_reset_forces_a_fresh_client_and_url_on_next_use(self, monkeypatch):
        first_client = FakeSqsClient()
        install_fake_boto3(monkeypatch, first_client, [])
        publisher.get_client()
        publisher.get_queue_url()

        publisher.reset_client()

        second_client = FakeSqsClient()
        install_fake_boto3(monkeypatch, second_client, [])
        assert publisher.get_client() is second_client
