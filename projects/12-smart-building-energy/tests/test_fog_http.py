"""Real HTTP-level tests against a genuine ThreadingHTTPServer on an ephemeral port, driven with http.client, since fog/app.py uses no framework and has no in-memory test client."""

import http.client
import json
import queue
import sys
import threading

import pytest

from conftest import load_module

fog_app = load_module("fog_app", "fog/app.py")
# Reuse the exact ingest_pipeline instance fog_app's imported functions are bound to (left in sys.modules by fog_app's import), not a second copy.
ingest_pipeline = sys.modules["ingest_pipeline"]


@pytest.fixture
def running_server():
    ingest_pipeline.TELEMETRY_INBOX = queue.Queue()
    ingest_pipeline._window_buffers.clear()
    ingest_pipeline._unit_by_type.clear()

    server = fog_app.ThreadingHTTPServer(("127.0.0.1", 0), fog_app.FogHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    consumer = threading.Thread(target=ingest_pipeline.consume_telemetry_forever, args=(ingest_pipeline.TELEMETRY_INBOX,), daemon=True)
    consumer.start()
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

    def test_thresholds_exposes_the_real_energy_rule(self, running_server):
        status, body = request(running_server, "GET", "/thresholds")
        assert status == 200
        assert {"field": "avg", "op": ">", "limit": 55, "key": "peak_load_warning"} in body["energy_consumption_kw"]

    def test_unknown_route_returns_404(self, running_server):
        status, _ = request(running_server, "GET", "/not-a-real-route")
        assert status == 404


class TestIngestValidation:
    def test_valid_batch_is_accepted_with_202(self, running_server):
        payload = {
            "sensor_type": "energy_consumption_kw",
            "site_id": "floor-1",
            "unit": "kW",
            "readings": [{"ts": "t0", "value": 25.0}, {"ts": "t1", "value": 27.0}],
        }
        status, body = request(running_server, "POST", "/ingest", payload)
        assert status == 202
        assert body == {"accepted": 2}

    def test_valid_batch_is_actually_buffered_end_to_end(self, running_server):
        payload = {
            "sensor_type": "co2_ppm",
            "site_id": "floor-2",
            "unit": "ppm",
            "readings": [{"ts": "t0", "value": 620.0}],
        }
        request(running_server, "POST", "/ingest", payload)
        ingest_pipeline.TELEMETRY_INBOX.join()
        snapshot, units = ingest_pipeline.drain_window_buffers()
        assert snapshot[("co2_ppm", "floor-2")] == [{"ts": "t0", "value": 620.0}]
        assert units["co2_ppm"] == "ppm"

    @pytest.mark.parametrize(
        "payload",
        [
            {"site_id": "floor-1", "readings": [{"ts": "t0", "value": 1.0}]},
            {"sensor_type": "energy_consumption_kw", "readings": []},
            {"sensor_type": "energy_consumption_kw", "readings": [{"ts": "t0"}]},
            {"sensor_type": "energy_consumption_kw", "readings": [{"ts": "t0", "value": "hot"}]},
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
