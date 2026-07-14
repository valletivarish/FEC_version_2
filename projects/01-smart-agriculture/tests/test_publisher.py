import json

import publisher


class FakeSqsClient:
    def __init__(self, url_results):
        self.url_results = list(url_results)
        self.sent = []

    def get_queue_url(self, QueueName):
        result = self.url_results.pop(0)
        if isinstance(result, Exception):
            raise result
        return {"QueueUrl": result}

    def send_message_batch(self, QueueUrl, Entries):
        self.sent.append((QueueUrl, Entries))


def make_publisher(monkeypatch, fake_client):
    monkeypatch.setattr(publisher.boto3, "client", lambda *a, **kw: fake_client)
    monkeypatch.setattr(publisher.time, "sleep", lambda *_: None)
    return publisher.SqsPublisher("http://localstack:4566", "eu-west-1", "fec-sensor-agg")


def test_resolve_queue_succeeds_immediately(monkeypatch):
    fake_client = FakeSqsClient(["http://queue-url"])
    p = make_publisher(monkeypatch, fake_client)
    assert p._queue_url == "http://queue-url"


def test_resolve_queue_retries_then_succeeds(monkeypatch):
    fake_client = FakeSqsClient([RuntimeError("not ready"), RuntimeError("not ready"), "http://queue-url"])
    p = make_publisher(monkeypatch, fake_client)
    assert p._queue_url == "http://queue-url"


def test_resolve_queue_gives_up_after_all_attempts(monkeypatch):
    fake_client = FakeSqsClient([RuntimeError("never ready")] * 3)
    monkeypatch.setattr(publisher.boto3, "client", lambda *a, **kw: fake_client)
    monkeypatch.setattr(publisher.time, "sleep", lambda *_: None)
    p = publisher.SqsPublisher.__new__(publisher.SqsPublisher)
    p._sqs = fake_client
    try:
        p._resolve_queue("fec-sensor-agg", attempts=3)
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "fec-sensor-agg" in str(exc)


def test_publish_batch_sends_all_messages_in_a_single_batch_call(monkeypatch):
    fake_client = FakeSqsClient(["http://queue-url"])
    p = make_publisher(monkeypatch, fake_client)

    p.publish_batch([
        {"sensor_type": "soil_moisture", "avg": 21.5},
        {"sensor_type": "temperature", "avg": 19.2},
        {"sensor_type": "rainfall", "avg": 0.4},
    ])

    assert len(fake_client.sent) == 1
    queue_url, entries = fake_client.sent[0]
    assert queue_url == "http://queue-url"
    assert len(entries) == 3
    assert json.loads(entries[0]["MessageBody"]) == {"sensor_type": "soil_moisture", "avg": 21.5}
    assert json.loads(entries[1]["MessageBody"]) == {"sensor_type": "temperature", "avg": 19.2}
    assert json.loads(entries[2]["MessageBody"]) == {"sensor_type": "rainfall", "avg": 0.4}
    # entry Ids must be unique within a single SendMessageBatch call
    assert len({e["Id"] for e in entries}) == 3


def test_publish_batch_chunks_at_the_ten_entry_sqs_limit(monkeypatch):
    fake_client = FakeSqsClient(["http://queue-url"])
    p = make_publisher(monkeypatch, fake_client)

    p.publish_batch([{"sensor_type": "soil_moisture", "avg": i} for i in range(23)])

    assert len(fake_client.sent) == 3
    sizes = [len(entries) for _, entries in fake_client.sent]
    assert sizes == [10, 10, 3]


def test_publish_batch_does_nothing_for_an_empty_window(monkeypatch):
    fake_client = FakeSqsClient(["http://queue-url"])
    p = make_publisher(monkeypatch, fake_client)

    p.publish_batch([])

    assert fake_client.sent == []
