import json

from conftest import load_module

publisher = load_module("bshm_publisher", "fog/publisher.py")


class FakeSqsClient:
    def __init__(self):
        self.sent = []

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, MessageBody))


def test_publish_sends_json_body_to_given_url():
    client = FakeSqsClient()
    payload = {"sensor_type": "strain_microstrain", "site_id": "span-a", "avg": 310.5}

    publisher.publish(client, "http://queue-url", payload)

    assert len(client.sent) == 1
    queue_url, body = client.sent[0]
    assert queue_url == "http://queue-url"
    assert json.loads(body) == payload


def test_publish_takes_client_and_url_as_explicit_parameters_every_call():
    # No caching of any kind: two calls against two different fake clients
    # and two different urls must not interfere with each other.
    client_a, client_b = FakeSqsClient(), FakeSqsClient()

    publisher.publish(client_a, "url-a", {"n": 1})
    publisher.publish(client_b, "url-b", {"n": 2})

    assert client_a.sent == [("url-a", json.dumps({"n": 1}))]
    assert client_b.sent == [("url-b", json.dumps({"n": 2}))]


def test_publisher_module_has_no_module_level_client_state():
    # The module should expose exactly the publish() function and its
    # import -- no cached client, no cached queue url, no class.
    exported = [name for name in dir(publisher) if not name.startswith("_")]
    assert exported == ["json", "publish"]
