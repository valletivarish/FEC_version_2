import json

from conftest import load_module

# Loaded once, then referenced via lambda_handler's own attributes below --
# lambda_handler.py's top-level `import data_access` / `from
# thresholds_proxy import ThresholdsUnavailable` resolve to their own
# module/class objects at import time, so patching a second, separately
# load_module()'d instance would silently miss (isinstance/attribute
# lookups would fail against a different object than the one
# lambda_handler.py actually calls into).
lambda_handler = load_module("bshm_lambda_handler", "backend/dashboard/lambda_handler.py")
data_access = lambda_handler.data_access
ThresholdsUnavailable = lambda_handler.ThresholdsUnavailable


def api_event(method, path, query=None):
    return {"httpMethod": method, "path": path, "queryStringParameters": query}


def body_of(resp):
    return json.loads(resp["body"])


def test_every_response_carries_cors_header(monkeypatch):
    monkeypatch.setattr(data_access, "span_report", lambda: [])
    resp = lambda_handler.lambda_handler(api_event("GET", "/api/spans"), None)
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"


def test_options_request_short_circuits(monkeypatch):
    resp = lambda_handler.lambda_handler(api_event("OPTIONS", "/api/spans"), None)
    assert resp["statusCode"] == 200


def test_unknown_route_returns_404():
    resp = lambda_handler.lambda_handler(api_event("GET", "/api/nonexistent"), None)
    assert resp["statusCode"] == 404
    assert "no route" in body_of(resp)["error"]


def test_readings_rejects_unknown_sensor_type():
    resp = lambda_handler.lambda_handler(api_event("GET", "/api/readings", {"sensor_type": "bogus"}), None)
    assert resp["statusCode"] == 400


def test_readings_rejects_non_positive_limit():
    resp = lambda_handler.lambda_handler(
        api_event("GET", "/api/readings", {"sensor_type": "strain_microstrain", "limit": "0"}), None
    )
    assert resp["statusCode"] == 400


def test_readings_filters_by_site_id(monkeypatch):
    rows = [
        {"site_id": "span-a", "avg": 500.0},
        {"site_id": "span-b", "avg": 600.0},
    ]
    monkeypatch.setattr(data_access, "recent_windows", lambda sensor_type, limit: rows)
    resp = lambda_handler.lambda_handler(
        api_event("GET", "/api/readings", {"sensor_type": "strain_microstrain", "site_id": "span-a"}), None
    )
    assert resp["statusCode"] == 200
    payload = body_of(resp)
    assert [item["site_id"] for item in payload["items"]] == ["span-a"]


def test_readings_defaults_to_limit_sixty(monkeypatch):
    captured = {}

    def fake_recent_windows(sensor_type, limit):
        captured["limit"] = limit
        return []

    monkeypatch.setattr(data_access, "recent_windows", fake_recent_windows)
    lambda_handler.lambda_handler(api_event("GET", "/api/readings", {"sensor_type": "strain_microstrain"}), None)
    assert captured["limit"] == 60


def test_spans_returns_span_report(monkeypatch):
    monkeypatch.setattr(data_access, "span_report", lambda: [{"site_id": "span-a"}])
    resp = lambda_handler.lambda_handler(api_event("GET", "/api/spans"), None)
    assert body_of(resp) == {"spans": [{"site_id": "span-a"}]}


def test_thresholds_proxies_fog_response(monkeypatch):
    monkeypatch.setattr(lambda_handler, "fetch_thresholds", lambda url: {"strain_microstrain": []})
    resp = lambda_handler.lambda_handler(api_event("GET", "/api/thresholds"), None)
    assert resp["statusCode"] == 200
    assert body_of(resp) == {"strain_microstrain": []}


def test_thresholds_returns_502_when_fog_unreachable(monkeypatch):
    def raise_unavailable(url):
        raise ThresholdsUnavailable("could not reach fog")

    monkeypatch.setattr(lambda_handler, "fetch_thresholds", raise_unavailable)
    resp = lambda_handler.lambda_handler(api_event("GET", "/api/thresholds"), None)
    assert resp["statusCode"] == 502


def test_health_reports_all_four_fields(monkeypatch):
    monkeypatch.setattr(lambda_handler, "_fog_reachable", lambda: True)
    monkeypatch.setattr(data_access, "queue_reachable", lambda: True)
    monkeypatch.setattr(data_access, "lambda_active", lambda: True)
    monkeypatch.setattr(data_access, "freshest_window_age", lambda now: 2.0)

    resp = lambda_handler.lambda_handler(api_event("GET", "/api/health"), None)
    payload = body_of(resp)
    assert payload == {
        "gateway": True,
        "queue": True,
        "lambda": True,
        "pipeline": True,
        "freshest_age_seconds": 2.0,
    }


def test_health_pipeline_false_when_stale(monkeypatch):
    monkeypatch.setattr(lambda_handler, "_fog_reachable", lambda: True)
    monkeypatch.setattr(data_access, "queue_reachable", lambda: True)
    monkeypatch.setattr(data_access, "lambda_active", lambda: True)
    monkeypatch.setattr(data_access, "freshest_window_age", lambda now: 999.0)

    resp = lambda_handler.lambda_handler(api_event("GET", "/api/health"), None)
    assert body_of(resp)["pipeline"] is False


def test_backend_stats_combines_queue_and_table_count(monkeypatch):
    monkeypatch.setattr(data_access, "queue_depth", lambda: {"waiting": 3, "in_flight": 1})
    monkeypatch.setattr(data_access, "items_in_table", lambda: 42)

    resp = lambda_handler.lambda_handler(api_event("GET", "/api/backend-stats"), None)
    assert body_of(resp) == {"queue": {"waiting": 3, "in_flight": 1}, "items_in_table": 42}
