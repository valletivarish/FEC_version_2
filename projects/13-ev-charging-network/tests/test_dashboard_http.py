"""Real HTTP-level tests for the dashboard backend Flask app, driven
against a genuine werkzeug server on an ephemeral port (see the module
docstring in tests/test_fog_http.py for why Flask's in-process test_client
would not satisfy this). DynamoDB/SQS/Lambda are always faked here;
nothing in this file touches real AWS or LocalStack.
"""

import datetime
import http.client
import json
import threading

import pytest
from werkzeug.serving import make_server

from conftest import load_module

dash_app = load_module("dash_app", "backend/dashboard/app.py")


class FakeSqsHealthy:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": f"http://queue/{QueueName}"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        if "ApproximateNumberOfMessages" in AttributeNames:
            return {"Attributes": {"ApproximateNumberOfMessages": "2", "ApproximateNumberOfMessagesNotVisible": "0"}}
        return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:ecn-hub-agg"}}


class FakeLambdaActive:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Active"}}


class FakeTableWithData:
    def __init__(self, rows_by_sensor_type):
        self.rows_by_sensor_type = rows_by_sensor_type

    def query(self, KeyConditionExpression, ScanIndexForward, Limit):
        sensor_type = KeyConditionExpression.get_expression()["values"][1]
        rows = list(self.rows_by_sensor_type.get(sensor_type, []))
        if ScanIndexForward is False:
            rows = list(reversed(rows))
        return {"Items": rows[:Limit]}

    def scan(self, Select):
        return {"Count": sum(len(v) for v in self.rows_by_sensor_type.values())}


def row(sensor_type, site_id, window_end, avg, unit="A", alerts=None):
    return {
        "sensor_type": sensor_type, "site_id": site_id, "unit": unit,
        "window_start": "s", "window_end": window_end,
        "count": 3, "min": avg - 1, "max": avg + 1, "avg": avg, "latest": avg,
        "alerts": alerts or [],
    }


@pytest.fixture
def running_server(monkeypatch):
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    fixture = {
        "charging_current_a": [row("charging_current_a", "hub-1", now_iso, 22.0)],
        "station_temp_c": [row("station_temp_c", "hub-1", now_iso, 31.0, unit="C")],
    }
    monkeypatch.setattr(dash_app.data_access, "table", lambda: FakeTableWithData(fixture))
    monkeypatch.setattr(dash_app.data_access, "sqs", lambda: FakeSqsHealthy())
    monkeypatch.setattr(dash_app.data_access, "lambda_client", lambda: FakeLambdaActive())
    monkeypatch.setattr(dash_app, "fog_reachable", lambda: True)
    dash_app._thresholds_cache.reset()

    server = make_server("127.0.0.1", 0, dash_app.app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()


def get(port, path):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        conn.request("GET", path)
        resp = conn.getresponse()
        raw = resp.read()
        return resp.status, (json.loads(raw) if raw else None)
    finally:
        conn.close()


class TestHubsEndpoint:
    def test_hubs_returns_both_hubs_with_readings(self, running_server):
        status, body = get(running_server, "/api/hubs")
        assert status == 200
        by_site = {h["site_id"]: h for h in body["hubs"]}
        assert set(by_site) == {"hub-1", "hub-2"}
        hub1 = by_site["hub-1"]
        assert hub1["readings"]["charging_current_a"]["avg"] == 22.0
        assert hub1["readings"]["station_temp_c"]["avg"] == 31.0
        assert by_site["hub-2"]["readings"]["charging_current_a"] is None


class TestReadingsEndpoint:
    def test_valid_sensor_type_returns_200(self, running_server):
        status, body = get(running_server, "/api/readings?sensor_type=charging_current_a&limit=10")
        assert status == 200
        assert body["sensor_type"] == "charging_current_a"

    def test_missing_sensor_type_returns_400(self, running_server):
        status, _ = get(running_server, "/api/readings")
        assert status == 400

    def test_unknown_sensor_type_returns_400(self, running_server):
        status, _ = get(running_server, "/api/readings?sensor_type=not_real")
        assert status == 400

    def test_non_integer_limit_returns_400(self, running_server):
        status, _ = get(running_server, "/api/readings?sensor_type=station_temp_c&limit=abc")
        assert status == 400

    def test_site_id_filter_narrows_results(self, running_server):
        status, body = get(running_server, "/api/readings?sensor_type=charging_current_a&site_id=hub-2")
        assert status == 200
        assert body["items"] == []


class TestHealthAndBackendStats:
    def test_health_reports_true_for_every_reachable_dependency(self, running_server):
        status, body = get(running_server, "/api/health")
        assert status == 200
        assert body["gateway"] is True
        assert body["queue"] is True
        assert body["lambda"] is True

    def test_backend_stats_reports_queue_depth_and_item_count(self, running_server):
        status, body = get(running_server, "/api/backend-stats")
        assert status == 200
        assert body["queue"] == {"waiting": 2, "in_flight": 0}
        assert body["items_in_table"] == 2


class TestThresholdsProxyEndpoint:
    def test_returns_502_when_the_fog_gateway_is_unreachable(self, running_server):
        # The fixture points FOG_THRESHOLDS_URL at the unreachable
        # http://fog:8000/thresholds default -- this exercises the real
        # thresholds_proxy.fetch_thresholds() unreachable-upstream path
        # through the live HTTP route, not just the unit test in
        # test_thresholds_proxy.py.
        status, body = get(running_server, "/api/thresholds")
        assert status == 502
        assert "error" in body

    def test_proxies_a_real_reachable_upstream_successfully(self, monkeypatch):
        import threading as _threading
        from http.server import BaseHTTPRequestHandler, HTTPServer

        rules = {"station_temp_c": [{"field": "avg", "op": ">", "limit": 45, "key": "overheat_risk"}]}

        class FakeFogHandler(BaseHTTPRequestHandler):
            def log_message(self, fmt, *args):
                pass

            def do_GET(self):
                body = json.dumps(rules).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        fake_fog = HTTPServer(("127.0.0.1", 0), FakeFogHandler)
        fake_fog_thread = _threading.Thread(target=fake_fog.serve_forever, daemon=True)
        fake_fog_thread.start()

        monkeypatch.setattr(dash_app, "FOG_THRESHOLDS_URL", f"http://127.0.0.1:{fake_fog.server_address[1]}/thresholds")
        dash_app._thresholds_cache.reset()

        server = make_server("127.0.0.1", 0, dash_app.app)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        try:
            status, body = get(server.server_address[1], "/api/thresholds")
        finally:
            server.shutdown()
            server.server_close()
            fake_fog.shutdown()
            fake_fog.server_close()

        assert status == 200
        assert body == rules


class TestStaticAndMisc:
    def test_index_is_served_at_root(self, running_server):
        conn = http.client.HTTPConnection("127.0.0.1", running_server, timeout=5)
        conn.request("GET", "/")
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        assert resp.status == 200
        assert b"EV Charging Network" in body

    def test_unknown_api_route_returns_404(self, running_server):
        status, _ = get(running_server, "/api/not-a-real-endpoint")
        assert status == 404
