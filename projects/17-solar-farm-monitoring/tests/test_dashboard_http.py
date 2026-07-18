"""Real HTTP-level tests for the dashboard backend on an ephemeral ThreadingHTTPServer; DynamoDB/SQS/Lambda are always faked."""

import http.client
import json
import threading

import pytest

from conftest import load_module

dash_app = load_module("dash_app", "backend/dashboard/app.py")


class FakeSqsHealthy:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": f"http://queue/{QueueName}"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        if "ApproximateNumberOfMessages" in AttributeNames:
            return {"Attributes": {"ApproximateNumberOfMessages": "2", "ApproximateNumberOfMessagesNotVisible": "0"}}
        return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:sfm-array-agg"}}


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


def row(sensor_type, site_id, window_end, avg, unit="kW", alerts=None):
    return {
        "sensor_type": sensor_type, "site_id": site_id, "unit": unit,
        "window_start": "s", "window_end": window_end,
        "count": 3, "min": avg - 1, "max": avg + 1, "avg": avg, "latest": avg,
        "alerts": alerts or [],
    }


@pytest.fixture
def running_server(monkeypatch):
    import datetime

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    fixture = {
        "inverter_output_kw": [row("inverter_output_kw", "array-1", now_iso, 90.0)],
        "panel_temp_c": [row("panel_temp_c", "array-1", now_iso, 40.0, unit="C")],
    }
    monkeypatch.setattr(dash_app.data_access, "table", lambda: FakeTableWithData(fixture))
    monkeypatch.setattr(dash_app.data_access, "sqs", lambda: FakeSqsHealthy())
    monkeypatch.setattr(dash_app.data_access, "lambda_client", lambda: FakeLambdaActive())
    monkeypatch.setattr(dash_app, "fog_reachable", lambda: True)

    server = dash_app.ThreadingHTTPServer(("127.0.0.1", 0), dash_app.DashboardHandler)
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


class TestArraysEndpoint:
    def test_arrays_returns_both_sites_with_readings_and_efficiency_index(self, running_server):
        status, body = get(running_server, "/api/arrays")
        assert status == 200
        by_site = {a["site_id"]: a for a in body["arrays"]}
        assert set(by_site) == {"array-1", "array-2"}
        array1 = by_site["array-1"]
        assert array1["readings"]["inverter_output_kw"]["avg"] == 90.0
        assert array1["efficiency_index"] is not None
        assert array1["efficiency_band"] in {"excellent", "good", "fair", "poor", "critical"}
        assert by_site["array-2"]["efficiency_index"] is None


class TestReadingsEndpoint:
    def test_valid_sensor_type_returns_200(self, running_server):
        status, body = get(running_server, "/api/readings?sensor_type=inverter_output_kw&limit=10")
        assert status == 200
        assert body["sensor_type"] == "inverter_output_kw"

    def test_missing_sensor_type_returns_400(self, running_server):
        status, _ = get(running_server, "/api/readings")
        assert status == 400

    def test_unknown_sensor_type_returns_400(self, running_server):
        status, _ = get(running_server, "/api/readings?sensor_type=not_real")
        assert status == 400

    def test_non_integer_limit_returns_400(self, running_server):
        status, _ = get(running_server, "/api/readings?sensor_type=panel_temp_c&limit=abc")
        assert status == 400

    def test_site_filter_narrows_results(self, running_server):
        status, body = get(running_server, "/api/readings?sensor_type=inverter_output_kw&site_id=array-2")
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


class TestStaticAndMisc:
    def test_index_is_served_at_root(self, running_server):
        conn = http.client.HTTPConnection("127.0.0.1", running_server, timeout=5)
        conn.request("GET", "/")
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        assert resp.status == 200
        assert b"Solar Farm Monitoring" in body

    def test_static_path_traversal_is_rejected(self, running_server):
        status, _ = get(running_server, "/static/../app.py")
        assert status == 400

    def test_unknown_route_returns_404(self, running_server):
        status, _ = get(running_server, "/api/not-a-real-endpoint")
        assert status == 404
