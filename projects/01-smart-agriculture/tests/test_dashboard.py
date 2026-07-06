import datetime
import urllib.error

from fastapi.testclient import TestClient

from conftest import load_module

dash = load_module("dash_app", "backend/dashboard/app.py")

FIXTURE = {
    "temperature": [
        {"sensor_type": "temperature", "site_id": "field-1", "window_end": "e1",
         "min": 20.0, "max": 22.0, "avg": 21.0, "latest": 22.0, "count": 4, "unit": "C", "alerts": []},
        {"sensor_type": "temperature", "site_id": "field-1", "window_end": "e2",
         "min": 36.0, "max": 38.0, "avg": 37.0, "latest": 38.0, "count": 4, "unit": "C", "alerts": ["heat_stress"]},
    ],
    "soil_moisture": [
        {"sensor_type": "soil_moisture", "site_id": "field-1", "window_end": "e1",
         "min": 28.0, "max": 30.0, "avg": 29.0, "latest": 29.0, "count": 5, "unit": "%", "alerts": []},
        {"sensor_type": "soil_moisture", "site_id": "field-2", "window_end": "e1",
         "min": 15.0, "max": 17.0, "avg": 16.0, "latest": 15.0, "count": 5, "unit": "%", "alerts": ["irrigation_needed"]},
    ],
}


def fake_latest(sensor_type, limit):
    return FIXTURE.get(sensor_type, [])[-limit:]


def test_readings_route(monkeypatch):
    monkeypatch.setattr(dash, "latest_readings", fake_latest)
    client = TestClient(dash.app)
    resp = client.get("/api/readings?sensor_type=temperature&limit=60")
    body = resp.json()
    assert body["sensor_type"] == "temperature"
    assert body["items"][-1]["avg"] == 37.0


def test_summary_uses_latest_item_per_site(monkeypatch):
    monkeypatch.setattr(dash, "latest_readings", fake_latest)
    client = TestClient(dash.app)
    sensors = {s["sensor_type"]: s for s in client.get("/api/summary").json()["sensors"]}

    temp_sites = {s["site_id"]: s for s in sensors["temperature"]["sites"]}
    assert temp_sites["field-1"]["latest"] == 38.0
    assert temp_sites["field-1"]["alerts"] == ["heat_stress"]
    assert temp_sites["field-1"]["min"] == 36.0
    assert temp_sites["field-1"]["max"] == 38.0

    assert sensors["rainfall"]["sites"] == []


def test_summary_groups_multiple_sites_separately(monkeypatch):
    monkeypatch.setattr(dash, "latest_readings", fake_latest)
    client = TestClient(dash.app)
    sensors = {s["sensor_type"]: s for s in client.get("/api/summary").json()["sensors"]}

    soil_sites = {s["site_id"]: s for s in sensors["soil_moisture"]["sites"]}
    assert set(soil_sites) == {"field-1", "field-2"}
    assert soil_sites["field-2"]["alerts"] == ["irrigation_needed"]
    assert soil_sites["field-1"]["alerts"] == []


def fake_latest_fresh(sensor_type, limit):
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return [{"sensor_type": sensor_type, "site_id": "field-1", "window_end": now_iso,
              "min": 1.0, "max": 2.0, "avg": 1.5, "latest": 1.5, "count": 1, "unit": "x", "alerts": []}]


class FakeUrlopenResponse:
    def __init__(self, status):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeSqsHealthy:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": "http://queue"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        if "ApproximateNumberOfMessages" in AttributeNames:
            return {"Attributes": {"ApproximateNumberOfMessages": "3", "ApproximateNumberOfMessagesNotVisible": "1"}}
        return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:fec-sensor-agg"}}


class FakeSqsBroken:
    def get_queue_url(self, QueueName):
        raise RuntimeError("no queue")


class FakeTableCount:
    def scan(self, Select):
        return {"Count": 42}


class FakeLambdaActive:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Active"}}


class FakeLambdaMissing:
    def get_function(self, FunctionName):
        raise RuntimeError("function not found")


def test_health_reports_all_ok_when_everything_reachable_and_fresh(monkeypatch):
    monkeypatch.setattr(dash, "latest_readings", fake_latest_fresh)
    monkeypatch.setattr(dash, "sqs", lambda: FakeSqsHealthy())
    monkeypatch.setattr(dash, "lambda_client", lambda: FakeLambdaActive())
    monkeypatch.setattr(dash.urllib.request, "urlopen", lambda url, timeout: FakeUrlopenResponse(200))
    client = TestClient(dash.app)
    body = client.get("/api/health").json()
    assert body == {
        "fog": True, "queue": True, "lambda": True,
        "pipeline": True, "freshest_age_seconds": body["freshest_age_seconds"],
    }
    assert body["freshest_age_seconds"] < 5


def test_health_reports_down_when_queue_fog_and_lambda_unreachable(monkeypatch):
    monkeypatch.setattr(dash, "latest_readings", lambda sensor_type, limit: [])
    monkeypatch.setattr(dash, "sqs", lambda: FakeSqsBroken())
    monkeypatch.setattr(dash, "lambda_client", lambda: FakeLambdaMissing())

    def raise_url_error(url, timeout):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(dash.urllib.request, "urlopen", raise_url_error)
    client = TestClient(dash.app)
    body = client.get("/api/health").json()
    assert body["fog"] is False
    assert body["queue"] is False
    assert body["lambda"] is False
    assert body["pipeline"] is False
    assert body["freshest_age_seconds"] is None


def test_backend_stats_reports_queue_depth_and_item_count(monkeypatch):
    monkeypatch.setattr(dash, "sqs", lambda: FakeSqsHealthy())
    monkeypatch.setattr(dash, "table", lambda: FakeTableCount())
    client = TestClient(dash.app)
    body = client.get("/api/backend-stats").json()
    assert body == {"queue": {"waiting": 3, "in_flight": 1}, "items_in_table": 42}
