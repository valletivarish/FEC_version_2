import json
from unittest.mock import patch

from conftest import load_module

lambda_handler = load_module("mvs_dashboard_lambda_handler", "backend/dashboard/lambda_handler.py")
data_access = lambda_handler.data_access


def api_event(method, path, query=None):
    return {"httpMethod": method, "path": path, "queryStringParameters": query}


def body_of(response):
    return json.loads(response["body"])


def test_unknown_route_returns_404():
    response = lambda_handler.lambda_handler(api_event("GET", "/api/does-not-exist"), None)
    assert response["statusCode"] == 404


def test_readings_requires_sensor_type():
    response = lambda_handler.lambda_handler(api_event("GET", "/api/readings"), None)
    assert response["statusCode"] == 400
    assert "sensor_type" in body_of(response)["error"]


def test_readings_rejects_non_positive_limit():
    response = lambda_handler.lambda_handler(
        api_event("GET", "/api/readings", {"sensor_type": "hull_vibration_mm", "limit": "0"}), None
    )
    assert response["statusCode"] == 400


def test_readings_returns_items_for_valid_sensor_type():
    with patch.object(data_access, "recent_windows", return_value=[
        {"sensor_type": "hull_vibration_mm", "site_id": "vessel-a", "avg": 3.0},
        {"sensor_type": "hull_vibration_mm", "site_id": "vessel-b", "avg": 5.0},
    ]):
        response = lambda_handler.lambda_handler(
            api_event("GET", "/api/readings", {"sensor_type": "hull_vibration_mm"}), None
        )
    assert response["statusCode"] == 200
    body = body_of(response)
    assert body["sensor_type"] == "hull_vibration_mm"
    assert len(body["items"]) == 2


def test_readings_filters_by_site_id():
    with patch.object(data_access, "recent_windows", return_value=[
        {"sensor_type": "hull_vibration_mm", "site_id": "vessel-a", "avg": 3.0},
        {"sensor_type": "hull_vibration_mm", "site_id": "vessel-b", "avg": 5.0},
    ]):
        response = lambda_handler.lambda_handler(
            api_event("GET", "/api/readings", {"sensor_type": "hull_vibration_mm", "site_id": "vessel-a"}), None
        )
    body = body_of(response)
    assert [item["site_id"] for item in body["items"]] == ["vessel-a"]


def test_vessels_route():
    with patch.object(data_access, "vessel_report", return_value=[{"site_id": "vessel-a", "readings": {}}]):
        response = lambda_handler.lambda_handler(api_event("GET", "/api/vessels"), None)
    assert response["statusCode"] == 200
    assert body_of(response)["vessels"] == [{"site_id": "vessel-a", "readings": {}}]


def test_voyage_log_rejects_non_positive_limit():
    response = lambda_handler.lambda_handler(
        api_event("GET", "/api/voyage-log", {"limit": "-1"}), None
    )
    assert response["statusCode"] == 400


def test_voyage_log_returns_entries():
    with patch.object(data_access, "recent_log_entries", return_value=[{"sensor_type": "engine_room_temp_c"}]):
        response = lambda_handler.lambda_handler(api_event("GET", "/api/voyage-log"), None)
    assert response["statusCode"] == 200
    assert body_of(response)["entries"] == [{"sensor_type": "engine_room_temp_c"}]


def test_backend_stats_degrades_to_zero_on_scan_failure():
    with patch.object(data_access, "items_in_table", side_effect=RuntimeError("boom")), \
         patch.object(data_access, "queue_depth", return_value={"waiting": 0, "in_flight": 0}):
        response = lambda_handler.lambda_handler(api_event("GET", "/api/backend-stats"), None)
    assert response["statusCode"] == 200
    assert body_of(response)["items_in_table"] == 0


def test_health_reports_gateway_false_when_fog_unreachable():
    with patch.object(lambda_handler, "fetch_thresholds", side_effect=lambda_handler.ThresholdsUnavailable("down")), \
         patch.object(data_access, "freshest_window_age", return_value=None), \
         patch.object(data_access, "queue_reachable", return_value=True), \
         patch.object(data_access, "lambda_active", return_value=True):
        response = lambda_handler.lambda_handler(api_event("GET", "/api/health"), None)
    body = body_of(response)
    assert body["gateway"] is False
    assert body["pipeline"] is False
