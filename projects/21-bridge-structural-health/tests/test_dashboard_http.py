"""Real-socket HTTP tests for the dashboard's Bottle app: same
make_server-with-ThreadingMixIn approach app.main() uses in production."""

import json
import threading
import urllib.error
import urllib.request
from wsgiref.simple_server import make_server

import pytest
from conftest import load_module

dashboard_app = load_module("bshm_dashboard_app", "backend/dashboard/app.py")


def http_get(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


@pytest.fixture
def live_server():
    httpd = make_server("127.0.0.1", 0, dashboard_app.app, server_class=dashboard_app.ThreadingWSGIServer)
    port = httpd.server_port
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=5)
        httpd.server_close()


SAMPLE_SPANS = [
    {"site_id": "span-a", "structural_integrity_index": 88.5, "integrity_band": "excellent", "history": [], "readings": {}},
    {"site_id": "span-b", "structural_integrity_index": 40.0, "integrity_band": "poor", "history": [], "readings": {}},
]


class TestApiReadings:
    def test_valid_sensor_type_returns_items(self, live_server, monkeypatch):
        monkeypatch.setattr(
            dashboard_app.data_access, "recent_windows",
            lambda sensor_type, limit: [{"avg": 1.0, "site_id": "span-a"}],
        )
        status, payload = http_get(f"{live_server}/api/readings?sensor_type=strain_microstrain&limit=10")
        assert status == 200
        assert payload["sensor_type"] == "strain_microstrain"
        assert len(payload["items"]) == 1

    def test_unknown_sensor_type_rejected_with_400(self, live_server):
        status, payload = http_get(f"{live_server}/api/readings?sensor_type=not_real")
        assert status == 400
        assert "error" in payload

    def test_bad_limit_rejected_with_400(self, live_server):
        status, _payload = http_get(f"{live_server}/api/readings?sensor_type=strain_microstrain&limit=abc")
        assert status == 400

    def test_negative_limit_rejected_with_400(self, live_server):
        status, _payload = http_get(f"{live_server}/api/readings?sensor_type=strain_microstrain&limit=-5")
        assert status == 400

    def test_site_id_filters_results(self, live_server, monkeypatch):
        rows = [{"site_id": "span-a", "avg": 1.0}, {"site_id": "span-b", "avg": 2.0}]
        monkeypatch.setattr(dashboard_app.data_access, "recent_windows", lambda sensor_type, limit: rows)
        status, payload = http_get(f"{live_server}/api/readings?sensor_type=strain_microstrain&site_id=span-b")
        assert status == 200
        assert payload["items"] == [{"site_id": "span-b", "avg": 2.0}]


class TestApiSpans:
    def test_returns_span_report(self, live_server, monkeypatch):
        monkeypatch.setattr(dashboard_app.data_access, "span_report", lambda: SAMPLE_SPANS)
        status, payload = http_get(f"{live_server}/api/spans")
        assert status == 200
        assert payload == {"spans": SAMPLE_SPANS}


class TestApiHealth:
    def test_all_healthy(self, live_server, monkeypatch):
        monkeypatch.setattr(dashboard_app, "fetch_thresholds", lambda url, timeout=5: {"status": "ok"})
        monkeypatch.setattr(dashboard_app.data_access, "queue_reachable", lambda: True)
        monkeypatch.setattr(dashboard_app.data_access, "lambda_active", lambda: True)
        monkeypatch.setattr(dashboard_app.data_access, "freshest_window_age", lambda now: 2.0)

        status, payload = http_get(f"{live_server}/api/health")
        assert status == 200
        assert payload == {
            "gateway": True, "queue": True, "lambda": True,
            "pipeline": True, "freshest_age_seconds": 2.0,
        }

    def test_all_down(self, live_server, monkeypatch):
        def unreachable(url, timeout=5):
            raise dashboard_app.ThresholdsUnavailable("nope")

        monkeypatch.setattr(dashboard_app, "fetch_thresholds", unreachable)
        monkeypatch.setattr(dashboard_app.data_access, "queue_reachable", lambda: False)
        monkeypatch.setattr(dashboard_app.data_access, "lambda_active", lambda: False)
        monkeypatch.setattr(dashboard_app.data_access, "freshest_window_age", lambda now: None)

        status, payload = http_get(f"{live_server}/api/health")
        assert status == 200
        assert payload == {
            "gateway": False, "queue": False, "lambda": False,
            "pipeline": False, "freshest_age_seconds": None,
        }


class TestApiBackendStats:
    def test_returns_queue_and_item_count(self, live_server, monkeypatch):
        monkeypatch.setattr(dashboard_app.data_access, "queue_depth", lambda: {"waiting": 2, "in_flight": 1})
        monkeypatch.setattr(dashboard_app.data_access, "items_in_table", lambda: 42)
        status, payload = http_get(f"{live_server}/api/backend-stats")
        assert status == 200
        assert payload == {"queue": {"waiting": 2, "in_flight": 1}, "items_in_table": 42}


class TestApiThresholds:
    def test_proxies_fog_thresholds(self, live_server, monkeypatch):
        monkeypatch.setattr(dashboard_app, "fetch_thresholds", lambda url, timeout=5: {"strain_microstrain": []})
        status, payload = http_get(f"{live_server}/api/thresholds")
        assert status == 200
        assert payload == {"strain_microstrain": []}

    def test_returns_502_when_fog_unreachable(self, live_server, monkeypatch):
        def unreachable(url, timeout=5):
            raise dashboard_app.ThresholdsUnavailable("nope")

        monkeypatch.setattr(dashboard_app, "fetch_thresholds", unreachable)
        status, payload = http_get(f"{live_server}/api/thresholds")
        assert status == 502
        assert "error" in payload


class TestStaticAndIndex:
    def test_index_serves_html(self, live_server):
        with urllib.request.urlopen(f"{live_server}/", timeout=5) as resp:
            assert resp.status == 200
            body = resp.read().decode()
            assert "<title>" in body

    def test_static_style_served(self, live_server):
        with urllib.request.urlopen(f"{live_server}/static/style.css", timeout=5) as resp:
            assert resp.status == 200
