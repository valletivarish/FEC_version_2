"""API Gateway (REST API, proxy integration) entry point for the dashboard.
Dispatches on (method, path) via a single PEP 634 structural-pattern match
statement -- Python's own match/case, not a dict lookup, a decorator
registry, a regex scan, or a class hierarchy. Reuses data_access.py and
thresholds_proxy.py directly rather than duplicating their logic."""

import json
import os
from datetime import datetime, timezone

import data_access
from thresholds_proxy import ThresholdsUnavailable, fetch_thresholds

FOG_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")
FOG_THRESHOLDS_URL = os.getenv("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds")
PIPELINE_FRESH_SECONDS = float(os.getenv("PIPELINE_FRESH_SECONDS", "30"))

CORS_HEADERS = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}


def _response(status, body):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body)}


def _fog_reachable():
    try:
        fetch_thresholds(FOG_HEALTH_URL)
        return True
    except ThresholdsUnavailable:
        return False


def _readings(params):
    sensor_type = params.get("sensor_type", "")
    if sensor_type not in data_access.SENSOR_TYPES:
        return _response(400, {"error": f"unknown sensor_type: {sensor_type}"})

    try:
        limit = int(params.get("limit", "60"))
        if limit <= 0:
            raise ValueError
    except ValueError:
        return _response(400, {"error": "limit must be a positive integer"})

    site_id = params.get("site_id")
    items = data_access.recent_windows(sensor_type, limit)
    if site_id:
        items = [item for item in items if item["site_id"] == site_id]
    return _response(200, {"sensor_type": sensor_type, "items": items})


def _spans(_params):
    return _response(200, {"spans": data_access.span_report()})


def _thresholds(_params):
    try:
        payload = fetch_thresholds(FOG_THRESHOLDS_URL)
    except ThresholdsUnavailable as exc:
        return _response(502, {"error": str(exc)})
    return _response(200, payload)


def _health(_params):
    freshest_age = data_access.freshest_window_age(datetime.now(timezone.utc))
    pipeline_ok = freshest_age is not None and freshest_age <= PIPELINE_FRESH_SECONDS
    return _response(200, {
        "gateway": _fog_reachable(),
        "queue": data_access.queue_reachable(),
        "lambda": data_access.lambda_active(),
        "pipeline": pipeline_ok,
        "freshest_age_seconds": freshest_age,
    })


def _backend_stats(_params):
    return _response(200, {
        "queue": data_access.queue_depth(),
        "items_in_table": data_access.items_in_table(),
    })


def lambda_handler(event, _context):
    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    params = event.get("queryStringParameters") or {}

    if method == "OPTIONS":
        return _response(200, {})

    match (method, path):
        case ("GET", "/api/readings"):
            return _readings(params)
        case ("GET", "/api/spans"):
            return _spans(params)
        case ("GET", "/api/thresholds"):
            return _thresholds(params)
        case ("GET", "/api/health"):
            return _health(params)
        case ("GET", "/api/backend-stats"):
            return _backend_stats(params)
        case _:
            return _response(404, {"error": f"no route for {method} {path}"})
