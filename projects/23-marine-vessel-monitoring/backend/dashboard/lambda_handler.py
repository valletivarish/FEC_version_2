"""Lambda entry point for the dashboard API behind a real API Gateway REST
API ({proxy+}, AWS_PROXY integration). Routes are a flat dict keyed by
(method, path) -- a straight hash-map lookup, not Nithin's ordered
regex-list scan or Sachin's trie-walk router: the 4th distinct dispatch
shape in this portfolio. Every route function reuses data_access.py
directly, the same module app.py's Tornado handlers call locally, so the
business logic itself is identical between local dev and this deployment.
"""

import datetime
import json
import os

import data_access
from thresholds_proxy import ThresholdsUnavailable, fetch_thresholds

FOG_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")
FOG_THRESHOLDS_URL = os.getenv("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds")
PIPELINE_FRESH_SECONDS = 30


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }


def _readings(params):
    sensor_type = params.get("sensor_type")
    if not sensor_type or sensor_type not in data_access.SENSOR_TYPES:
        return _response(400, {
            "error": "sensor_type is required and must be one of: " + ", ".join(data_access.SENSOR_TYPES)
        })
    try:
        limit = int(params.get("limit", "60"))
        if limit <= 0:
            raise ValueError
    except ValueError:
        return _response(400, {"error": "limit must be a positive integer"})
    items = data_access.recent_windows(sensor_type, limit)
    site_id = params.get("site_id")
    if site_id:
        items = [item for item in items if item["site_id"] == site_id]
    return _response(200, {"sensor_type": sensor_type, "items": items})


def _vessels(params):
    return _response(200, {"vessels": data_access.vessel_report()})


def _voyage_log(params):
    try:
        limit = int(params.get("limit", "25"))
        if limit <= 0:
            raise ValueError
    except ValueError:
        return _response(400, {"error": "limit must be a positive integer"})
    return _response(200, {"entries": data_access.recent_log_entries(limit)})


def _thresholds(params):
    try:
        body = fetch_thresholds(FOG_THRESHOLDS_URL)
    except ThresholdsUnavailable as exc:
        return _response(502, {"error": str(exc)})
    return _response(200, body)


def _health(params):
    now = datetime.datetime.now(datetime.timezone.utc)
    freshest_age = data_access.freshest_window_age(now)
    pipeline_ok = freshest_age is not None and freshest_age <= PIPELINE_FRESH_SECONDS
    try:
        fetch_thresholds(FOG_HEALTH_URL, timeout=2)
        gateway = True
    except ThresholdsUnavailable:
        gateway = False
    return _response(200, {
        "gateway": gateway,
        "queue": data_access.queue_reachable(),
        "lambda": data_access.lambda_active(),
        "pipeline": pipeline_ok,
        "freshest_age_seconds": freshest_age,
    })


def _backend_stats(params):
    try:
        items = data_access.items_in_table()
    except Exception:
        items = 0
    return _response(200, {"queue": data_access.queue_depth(), "items_in_table": items})


ROUTES = {
    ("GET", "/api/readings"): _readings,
    ("GET", "/api/vessels"): _vessels,
    ("GET", "/api/voyage-log"): _voyage_log,
    ("GET", "/api/thresholds"): _thresholds,
    ("GET", "/api/health"): _health,
    ("GET", "/api/backend-stats"): _backend_stats,
}


def lambda_handler(event, context):
    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    params = event.get("queryStringParameters") or {}
    handler = ROUTES.get((method, path))
    if handler is None:
        return _response(404, {"error": "not found"})
    return handler(params)
