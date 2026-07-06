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

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, MessageBody))


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


def test_publish_sends_json_body_to_resolved_queue(monkeypatch):
    fake_client = FakeSqsClient(["http://queue-url"])
    p = make_publisher(monkeypatch, fake_client)

    p.publish({"sensor_type": "soil_moisture", "avg": 21.5})

    assert len(fake_client.sent) == 1
    queue_url, body = fake_client.sent[0]
    assert queue_url == "http://queue-url"
    assert json.loads(body) == {"sensor_type": "soil_moisture", "avg": 21.5}
