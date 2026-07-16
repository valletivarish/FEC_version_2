"""Real-socket HTTP tests for the Bottle fog node.

Every request in this file travels over an actual TCP connection to an
actual WSGI server bound to an ephemeral port (fog_app.make_threaded_server,
the same server class fog/app.py's main() uses in production) -- not
Bottle's in-process test client, which never opens a real socket.
"""

import json
import threading
import urllib.error
import urllib.request

import pytest
from conftest import load_module

fog_app = load_module("bshm_fog_app", "fog/app.py")


def http_request(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            parsed = json.loads(raw)
        except ValueError:
            parsed = raw.decode(errors="replace")
        return exc.code, parsed


@pytest.fixture
def live_server():
    fog_app.buffering.snapshot_and_clear()  # start each test with an empty buffer
    httpd = fog_app.make_threaded_server(fog_app.app, "127.0.0.1", 0)
    port = httpd.server_port
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=5)
        httpd.server_close()


class TestHealthAndThresholds:
    def test_health_ok(self, live_server):
        status, payload = http_request(f"{live_server}/health")
        assert status == 200
        assert payload == {"status": "ok"}

    def test_thresholds_matches_alert_rules(self, live_server):
        status, payload = http_request(f"{live_server}/thresholds")
        assert status == 200
        assert payload == fog_app.alerts.thresholds_payload()


class TestIngestValidation:
    def test_valid_batch_accepted(self, live_server):
        body = {
            "sensor_type": "strain_microstrain",
            "site_id": "span-a",
            "unit": "microstrain",
            "readings": [{"ts": "2026-01-01T00:00:00Z", "value": 320.0}],
        }
        status, payload = http_request(f"{live_server}/ingest", method="POST", body=body)
        assert status == 202
        assert payload == {"accepted": 1}

    def test_missing_sensor_type_rejected_with_400(self, live_server):
        body = {"readings": [{"ts": "t1", "value": 1.0}]}
        status, payload = http_request(f"{live_server}/ingest", method="POST", body=body)
        assert status == 400
        assert "error" in payload

    def test_empty_readings_rejected_with_400(self, live_server):
        body = {"sensor_type": "strain_microstrain", "readings": []}
        status, _payload = http_request(f"{live_server}/ingest", method="POST", body=body)
        assert status == 400

    def test_non_numeric_value_rejected_with_400(self, live_server):
        body = {"sensor_type": "strain_microstrain", "readings": [{"ts": "t1", "value": "bad"}]}
        status, _payload = http_request(f"{live_server}/ingest", method="POST", body=body)
        assert status == 400

    def test_malformed_json_body_rejected_with_400(self, live_server):
        req = urllib.request.Request(
            f"{live_server}/ingest",
            data=b"{not-json",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req, timeout=5)
        assert exc_info.value.code == 400

    def test_accepted_readings_are_buffered(self, live_server):
        body = {
            "sensor_type": "tilt_angle_deg",
            "site_id": "span-b",
            "unit": "deg",
            "readings": [{"ts": "t1", "value": 0.5}, {"ts": "t2", "value": 0.6}],
        }
        http_request(f"{live_server}/ingest", method="POST", body=body)
        assert ("tilt_angle_deg", "span-b", 0.5, "t1") in fog_app.buffering.RAW
        assert ("tilt_angle_deg", "span-b", 0.6, "t2") in fog_app.buffering.RAW


class BatchQueueSpy:
    def __init__(self):
        self.batches = []

    def send_message_batch(self, QueueUrl, Entries):
        self.batches.append((QueueUrl, [json.loads(e["MessageBody"]) for e in Entries]))

    @property
    def sent(self):
        """Flattened (queue_url, message) pairs across every batch call, so
        existing per-message assertions read the same as before batching."""
        return [(url, msg) for url, msgs in self.batches for msg in msgs]


def test_flush_once_aggregates_and_publishes_one_message_per_group():
    fog_app.buffering.snapshot_and_clear()
    fog_app.buffering.set_unit("strain_microstrain", "microstrain")
    fog_app.buffering.record("strain_microstrain", "span-a", 1300.0, "t1")
    fog_app.buffering.record("strain_microstrain", "span-a", 1300.0, "t2")
    fog_app.buffering.record("strain_microstrain", "span-b", 100.0, "t3")

    client = BatchQueueSpy()
    messages = fog_app.flush_once(client, "http://queue-url")

    assert len(client.sent) == 2
    assert len(messages) == 2
    assert len(client.batches) == 1, "both messages must go out in a single batch call"

    by_site = {m["site_id"]: m for m in messages}
    assert by_site["span-a"]["avg"] == 1300.0
    assert by_site["span-a"]["alerts"] == ["structural_stress_warning"]
    assert by_site["span-b"]["alerts"] == []


def test_flush_once_is_a_noop_on_empty_buffer():
    fog_app.buffering.snapshot_and_clear()
    client = BatchQueueSpy()
    messages = fog_app.flush_once(client, "http://queue-url")
    assert messages == []
    assert client.sent == []
    assert client.batches == []
