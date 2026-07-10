"""Real HTTP-level tests against a genuine wsgiref.simple_server instance
bound to an ephemeral port (port 0), driven with http.client -- fog/app.py
is a hand-written WSGI callable (def app(environ, start_response)), not a
framework app, so there is no in-memory TestClient to dispatch through.
Same discipline as the portfolio's plain-stdlib-HTTP siblings, applied here
on top of wsgiref.simple_server instead of http.server/FastAPI/Flask.
"""

import http.client
import json
import sys
import threading
from wsgiref.simple_server import make_server

import pytest

from conftest import load_module

fog_app = load_module("fog_app", "fog/app.py")
# fog_app.py does `from buffering import add_readings, snapshot_and_clear`,
# which as a side effect leaves the real "buffering" module (the exact
# instance fog_app's imported functions are bound to) registered in
# sys.modules -- grab that same instance rather than re-importing a second,
# disconnected copy via load_module.
buffering = sys.modules["buffering"]


@pytest.fixture
def running_server():
    buffering._buffers.clear()
    buffering._units.clear()

    httpd = make_server(
        "127.0.0.1", 0, fog_app.app, fog_app.ThreadingWSGIServer, handler_class=fog_app.QuietWSGIRequestHandler,
    )
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield httpd.server_address[1]
    finally:
        httpd.shutdown()
        httpd.server_close()


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

    def test_thresholds_exposes_the_real_occupied_spaces_rule(self, running_server):
        status, body = request(running_server, "GET", "/thresholds")
        assert status == 200
        assert {"field": "avg", "op": ">", "limit": 270, "key": "near_full_capacity"} in body["occupied_spaces"]

    def test_thresholds_exposes_the_real_gate_fault_rule_on_max(self, running_server):
        status, body = request(running_server, "GET", "/thresholds")
        assert status == 200
        assert {"field": "max", "op": ">", "limit": 3, "key": "gate_fault_detected"} in body["gate_fault_events"]

    def test_unknown_route_returns_404(self, running_server):
        status, _ = request(running_server, "GET", "/not-a-real-route")
        assert status == 404


class TestIngestValidation:
    def test_valid_batch_is_accepted_with_202(self, running_server):
        payload = {
            "sensor_type": "occupied_spaces",
            "site_id": "lot-a",
            "unit": "count",
            "readings": [{"ts": "t0", "value": 80.0}, {"ts": "t1", "value": 85.0}],
        }
        status, body = request(running_server, "POST", "/ingest", payload)
        assert status == 202
        assert body == {"accepted": 2}

    def test_valid_batch_is_actually_buffered_end_to_end(self, running_server):
        payload = {
            "sensor_type": "gate_fault_events",
            "site_id": "lot-b",
            "unit": "count",
            "readings": [{"ts": "t0", "value": 1.0}],
        }
        request(running_server, "POST", "/ingest", payload)
        snapshot, units = buffering.snapshot_and_clear()
        assert snapshot[("gate_fault_events", "lot-b")] == [{"ts": "t0", "value": 1.0}]
        assert units["gate_fault_events"] == "count"

    @pytest.mark.parametrize(
        "payload",
        [
            {"site_id": "lot-a", "readings": [{"ts": "t0", "value": 1.0}]},
            {"sensor_type": "occupied_spaces", "readings": []},
            {"sensor_type": "occupied_spaces", "readings": [{"ts": "t0"}]},
            {"sensor_type": "occupied_spaces", "readings": [{"ts": "t0", "value": "full"}]},
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
