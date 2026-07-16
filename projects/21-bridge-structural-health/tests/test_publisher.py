import json

from conftest import load_module

publisher = load_module("bshm_publisher", "fog/publisher.py")


class BatchQueueSpy:
    def __init__(self):
        self.sent = []
        self.batches = []

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, MessageBody))

    def send_message_batch(self, QueueUrl, Entries):
        self.batches.append((QueueUrl, Entries))


def test_publish_sends_json_body_to_given_url():
    client = BatchQueueSpy()
    payload = {"sensor_type": "strain_microstrain", "site_id": "span-a", "avg": 310.5}

    publisher.publish(client, "http://queue-url", payload)

    assert len(client.sent) == 1
    queue_url, body = client.sent[0]
    assert queue_url == "http://queue-url"
    assert json.loads(body) == payload


def test_publish_takes_client_and_url_as_explicit_parameters_every_call():
    # No caching of any kind: two calls against two different fake clients
    # and two different urls must not interfere with each other.
    client_a, client_b = BatchQueueSpy(), BatchQueueSpy()

    publisher.publish(client_a, "url-a", {"n": 1})
    publisher.publish(client_b, "url-b", {"n": 2})

    assert client_a.sent == [("url-a", json.dumps({"n": 1}))]
    assert client_b.sent == [("url-b", json.dumps({"n": 2}))]


def test_publisher_module_has_no_module_level_client_state():
    # The module should expose exactly its two functions, the BATCH_LIMIT
    # constant, and the json import -- no cached client, no cached queue
    # url, no class.
    exported = sorted(name for name in dir(publisher) if not name.startswith("_"))
    assert exported == ["BATCH_LIMIT", "json", "publish", "publish_batch"]


def test_publish_batch_chunks_a_window_at_the_ten_entry_limit():
    client = BatchQueueSpy()
    payloads = [{"seq": i} for i in range(23)]

    calls = publisher.publish_batch(client, "http://queue-url", payloads)

    assert calls == 3
    assert [len(entries) for _, entries in client.batches] == [10, 10, 3]
    last_entry = client.batches[2][1][2]
    assert json.loads(last_entry["MessageBody"])["seq"] == 22
    all_ids = [entry["Id"] for _, entries in client.batches for entry in entries]
    assert len(set(all_ids)) == 23


def test_publish_batch_with_no_payloads_sends_nothing():
    client = BatchQueueSpy()
    calls = publisher.publish_batch(client, "http://queue-url", [])
    assert calls == 0
    assert client.batches == []
