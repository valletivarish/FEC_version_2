"""Real HTTP-level tests against a genuine werkzeug server bound to an
ephemeral port (port 0), driven with http.client -- fog/app.py is a Flask
app, but Flask's in-process test_client() never opens a real socket, so it
would not satisfy the "real HTTP-level test" requirement this project's
/ingest validation needs. werkzeug.serving.make_server gives Flask a real
listening TCP socket to test against, matching the discipline already used
for this portfolio's plain-http.server Python sibling and its Java/Node
plain-HTTP-server siblings.
"""

import http.client
import json
import threading

import pytest
from werkzeug.serving import make_server

from conftest import load_module

fog_app = load_module("fog_app", "fog/app.py")


@pytest.fixture
def running_server(monkeypatch):
    fog_app._buffer.clear()
    fog_app._units.clear()
    monkeypatch.setattr(fog_app, "publish_batch", lambda messages: None)

    server = make_server("127.0.0.1", 0, fog_app.app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()


def request(port, method, path, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        headers = {"Content-Type": "application/json"} if body is not None else {}
        payload = json.dumps(body).encode() if body is not None else None
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        raw = resp.read()
        parsed = json.loads(raw) if raw else None
        return resp.status, parsed
    finally:
        conn.close()


class TestHealthAndThresholds:
    def test_health_returns_200_ok(self, running_server):
        status, body = request(running_server, "GET", "/health")
        assert status == 200
        assert body == {"status": "ok"}

    def test_thresholds_exposes_the_real_overheat_rule(self, running_server):
        status, body = request(running_server, "GET", "/thresholds")
        assert status == 200
        assert {"field": "avg", "op": ">", "limit": 45, "key": "overheat_risk"} in body["station_temp_c"]

    def test_thresholds_omits_battery_soc_pct(self, running_server):
        status, body = request(running_server, "GET", "/thresholds")
        assert status == 200
        assert "battery_soc_pct" not in body

    def test_unknown_route_returns_404(self, running_server):
        status, _ = request(running_server, "GET", "/not-a-real-route")
        assert status == 404


class TestIngestValidation:
    def test_valid_batch_is_accepted_with_202(self, running_server):
        payload = {
            "sensor_type": "charging_current_a",
            "site_id": "hub-1",
            "unit": "A",
            "readings": [{"ts": "t0", "value": 18.0}, {"ts": "t1", "value": 19.5}],
        }
        status, body = request(running_server, "POST", "/ingest", payload)
        assert status == 202
        assert body == {"accepted": 2}

    def test_valid_batch_is_actually_buffered_under_the_lock(self, running_server):
        payload = {
            "sensor_type": "station_temp_c",
            "site_id": "hub-2",
            "unit": "C",
            "readings": [{"ts": "t0", "value": 31.0}],
        }
        request(running_server, "POST", "/ingest", payload)
        assert fog_app._buffer[("station_temp_c", "hub-2")] == [{"ts": "t0", "value": 31.0}]
        assert fog_app._units["station_temp_c"] == "C"

    @pytest.mark.parametrize(
        "payload",
        [
            {"site_id": "hub-1", "readings": [{"ts": "t0", "value": 1.0}]},
            {"sensor_type": "charging_current_a", "readings": []},
            {"sensor_type": "charging_current_a", "readings": [{"ts": "t0"}]},
            {"sensor_type": "charging_current_a", "readings": [{"ts": "t0", "value": "hot"}]},
            {"sensor_type": "", "readings": [{"ts": "t0", "value": 1.0}]},
        ],
    )
    def test_malformed_payloads_are_rejected_with_400(self, running_server, payload):
        status, body = request(running_server, "POST", "/ingest", payload)
        assert status == 400
        assert "error" in body

    def test_non_json_body_is_rejected_with_400(self, running_server):
        conn = http.client.HTTPConnection("127.0.0.1", running_server, timeout=5)
        conn.request("POST", "/ingest", body=b"not json at all", headers={"Content-Type": "application/json"})
        resp = conn.getresponse()
        status = resp.status
        resp.read()
        conn.close()
        assert status == 400

    def test_unknown_post_route_returns_404(self, running_server):
        status, _ = request(running_server, "POST", "/not-ingest", {"a": 1})
        assert status == 404


class TestFlushOnce:
    def test_flush_once_aggregates_and_publishes_one_message_per_group(self, running_server):
        batches = []
        fog_app.publish_batch = batches.append

        request(running_server, "POST", "/ingest", {
            "sensor_type": "grid_load_kw", "site_id": "hub-1", "unit": "kW",
            "readings": [{"ts": "t0", "value": 40.0}, {"ts": "t1", "value": 44.0}],
        })
        fog_app.flush_once()

        assert len(batches) == 1
        assert len(batches[0]) == 1
        message = batches[0][0]
        assert message["sensor_type"] == "grid_load_kw"
        assert message["site_id"] == "hub-1"
        assert message["count"] == 2
        assert message["avg"] == 42.0
        assert fog_app._buffer == {}

    def test_flush_once_evaluates_real_alert_rules(self, running_server):
        batches = []
        fog_app.publish_batch = batches.append

        request(running_server, "POST", "/ingest", {
            "sensor_type": "station_temp_c", "site_id": "hub-1", "unit": "C",
            "readings": [{"ts": "t0", "value": 50.0}],
        })
        fog_app.flush_once()

        assert batches[0][0]["alerts"] == ["overheat_risk"]

    def test_flush_once_publishes_every_group_in_one_batch_call_not_one_send_per_group(self, running_server):
        """The bug this guards against: looping publish() once per group
        instead of collecting the whole window into a single
        publish_batch() call."""
        batches = []
        fog_app.publish_batch = batches.append

        request(running_server, "POST", "/ingest", {
            "sensor_type": "grid_load_kw", "site_id": "hub-1", "unit": "kW",
            "readings": [{"ts": "t0", "value": 40.0}],
        })
        request(running_server, "POST", "/ingest", {
            "sensor_type": "battery_soc_pct", "site_id": "hub-2", "unit": "%",
            "readings": [{"ts": "t0", "value": 55.0}],
        })
        fog_app.flush_once()

        assert len(batches) == 1
        assert {m["sensor_type"] for m in batches[0]} == {"grid_load_kw", "battery_soc_pct"}
