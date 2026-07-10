"""Bridge & structural health dashboard: REST API + static frontend, both
served by the same Bottle app (fog and dashboard independently choose
Bottle here; nothing about the dashboard's framework is one of the 5
differentiation axes documented in readme.txt)."""

import json
import os
from datetime import datetime, timezone
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, make_server

from bottle import Bottle, HTTPResponse, request, static_file

import data_access
from thresholds_proxy import ThresholdsUnavailable, fetch_thresholds

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
FOG_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")
FOG_THRESHOLDS_URL = os.getenv("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds")
PIPELINE_FRESH_SECONDS = float(os.getenv("PIPELINE_FRESH_SECONDS", "30"))

app = Bottle()


def json_response(payload, status=200):
    return HTTPResponse(status=status, body=json.dumps(payload), headers={"Content-Type": "application/json"})


@app.get("/")
def index():
    return static_file("index.html", root=STATIC_DIR)


@app.get("/static/<filepath:path>")
def static_assets(filepath):
    response = static_file(filepath, root=STATIC_DIR)
    response.set_header("Cache-Control", "no-store")
    return response


@app.get("/api/readings")
def api_readings():
    sensor_type = request.query.get("sensor_type", "")
    if sensor_type not in data_access.SENSOR_TYPES:
        return json_response({"error": f"unknown sensor_type: {sensor_type}"}, status=400)

    limit_raw = request.query.get("limit", "60")
    try:
        limit = int(limit_raw)
        if limit <= 0:
            raise ValueError
    except ValueError:
        return json_response({"error": "limit must be a positive integer"}, status=400)

    site_id = request.query.get("site_id")
    items = data_access.recent_windows(sensor_type, limit)
    if site_id:
        items = [item for item in items if item["site_id"] == site_id]

    return {"sensor_type": sensor_type, "items": items}


@app.get("/api/spans")
def api_spans():
    # Project-specific per-site grouping endpoint: one entry per bridge
    # span with its latest reading for all 5 sensor types plus the derived
    # structural integrity index trend.
    return {"spans": data_access.span_report()}


@app.get("/api/thresholds")
def api_thresholds():
    try:
        payload = fetch_thresholds(FOG_THRESHOLDS_URL)
    except ThresholdsUnavailable as exc:
        return json_response({"error": str(exc)}, status=502)
    return payload


@app.get("/api/health")
def api_health():
    gateway = _fog_reachable()
    queue_ok = data_access.queue_reachable()
    lambda_ok = data_access.lambda_active()
    freshest_age = data_access.freshest_window_age(datetime.now(timezone.utc))
    pipeline_ok = freshest_age is not None and freshest_age <= PIPELINE_FRESH_SECONDS
    return {
        "gateway": gateway,
        "queue": queue_ok,
        "lambda": lambda_ok,
        "pipeline": pipeline_ok,
        "freshest_age_seconds": freshest_age,
    }


def _fog_reachable():
    try:
        fetch_thresholds(FOG_HEALTH_URL)
        return True
    except ThresholdsUnavailable:
        return False


@app.get("/api/backend-stats")
def api_backend_stats():
    return {
        "queue": data_access.queue_depth(),
        "items_in_table": data_access.items_in_table(),
    }


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


def main():
    port = int(os.getenv("PORT", "8000"))
    httpd = make_server("0.0.0.0", port, app, server_class=ThreadingWSGIServer)
    print(f"dashboard listening on :{port}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
