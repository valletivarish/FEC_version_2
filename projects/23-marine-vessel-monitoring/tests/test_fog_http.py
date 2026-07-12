"""Real-socket HTTP tests for the Tornado fog node.

tornado.testing.AsyncHTTPTestCase binds a real tornado.httpserver.HTTPServer
to an ephemeral port (via tornado.testing.bind_unused_port()) and
self.fetch() drives it with tornado.httpclient's AsyncHTTPClient over an
actual TCP socket -- not an in-process ASGI/WSGI transport shim. This is
Tornado's own idiomatic test tooling, mirroring the real-socket discipline
this portfolio's other Python fog nodes apply via their own frameworks'
equivalent (aiohttp's TestServer/TestClient, Flask/Bottle through
werkzeug/wsgiref make_server, plain http.server's ThreadingHTTPServer).
"""

import json
import time

from tornado.testing import AsyncHTTPTestCase

from conftest import load_module

fog_app = load_module("mvs_fog_app", "fog/app.py")


class FakeSqsClient:
    def __init__(self):
        self.sent = []

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, json.loads(MessageBody)))


def wait_until(predicate, timeout=2.0, interval=0.02):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


class TestFogHttp(AsyncHTTPTestCase):
    def get_app(self):
        fog_app.buffering.snapshot_and_clear()
        return fog_app.make_app()

    def test_health_ok(self):
        response = self.fetch("/health")
        self.assertEqual(response.code, 200)
        self.assertEqual(json.loads(response.body), {"status": "ok"})

    def test_thresholds_matches_alert_rules(self):
        response = self.fetch("/thresholds")
        self.assertEqual(response.code, 200)
        self.assertEqual(json.loads(response.body), fog_app.thresholds_payload())

    def test_valid_batch_accepted(self):
        body = json.dumps({
            "sensor_type": "engine_room_temp_c",
            "site_id": "vessel-a",
            "unit": "C",
            "readings": [{"ts": "2026-01-01T00:00:00Z", "value": 60.0}],
        }).encode()
        response = self.fetch("/ingest", method="POST", body=body)
        self.assertEqual(response.code, 202)
        self.assertEqual(json.loads(response.body), {"accepted": 1})

    def test_missing_sensor_type_rejected_with_400(self):
        body = json.dumps({"readings": [{"ts": "t1", "value": 1.0}]}).encode()
        response = self.fetch("/ingest", method="POST", body=body)
        self.assertEqual(response.code, 400)
        self.assertIn("error", json.loads(response.body))

    def test_empty_readings_rejected_with_400(self):
        body = json.dumps({"sensor_type": "engine_room_temp_c", "readings": []}).encode()
        response = self.fetch("/ingest", method="POST", body=body)
        self.assertEqual(response.code, 400)

    def test_non_numeric_value_rejected_with_400(self):
        body = json.dumps({
            "sensor_type": "engine_room_temp_c",
            "readings": [{"ts": "t1", "value": "bad"}],
        }).encode()
        response = self.fetch("/ingest", method="POST", body=body)
        self.assertEqual(response.code, 400)

    def test_malformed_json_body_rejected_with_400(self):
        response = self.fetch("/ingest", method="POST", body=b"{not-json")
        self.assertEqual(response.code, 400)

    def test_empty_body_rejected_with_400(self):
        response = self.fetch("/ingest", method="POST", body=b"")
        self.assertEqual(response.code, 400)

    def test_wrong_route_returns_404(self):
        response = self.fetch("/no-such-route")
        self.assertEqual(response.code, 404)

    def test_accepted_readings_are_buffered(self):
        body = json.dumps({
            "sensor_type": "hull_vibration_mm",
            "site_id": "vessel-b",
            "unit": "mm/s",
            "readings": [{"ts": "t1", "value": 3.0}, {"ts": "t2", "value": 4.0}],
        }).encode()
        self.fetch("/ingest", method="POST", body=body)
        snapshot, units = fog_app.buffering.snapshot_and_clear()
        assert snapshot[("hull_vibration_mm", "vessel-b")] == [
            {"ts": "t1", "value": 3.0}, {"ts": "t2", "value": 4.0},
        ]
        assert units["hull_vibration_mm"] == "mm/s"


def test_flush_publishes_one_message_per_group_fire_and_forget():
    fog_app.buffering.snapshot_and_clear()
    fog_app.buffering.record("engine_room_temp_c", "vessel-a", "C", [{"ts": "t1", "value": 80.0}])
    fog_app.buffering.record("engine_room_temp_c", "vessel-b", "C", [{"ts": "t1", "value": 40.0}])

    client = FakeSqsClient()
    messages = fog_app.flush(client, "http://queue-url")

    assert len(messages) == 2
    assert wait_until(lambda: len(client.sent) == 2), "expected both fire-and-forget publishes to land"
    by_site = {m["site_id"]: m for m in messages}
    assert by_site["vessel-a"]["alerts"] == ["engine_overheat_risk"]
    assert by_site["vessel-b"]["alerts"] == []


def test_flush_evaluates_hull_vibration_on_max_not_avg():
    fog_app.buffering.snapshot_and_clear()
    fog_app.buffering.record("hull_vibration_mm", "vessel-a", "mm/s", [
        {"ts": "t1", "value": 2.0}, {"ts": "t2", "value": 18.0},
    ])
    client = FakeSqsClient()
    messages = fog_app.flush(client, "http://queue-url")
    assert messages[0]["alerts"] == ["hull_stress_warning"]


def test_flush_is_a_noop_on_empty_buffer():
    fog_app.buffering.snapshot_and_clear()
    client = FakeSqsClient()
    messages = fog_app.flush(client, "http://queue-url")
    assert messages == []
    assert client.sent == []
