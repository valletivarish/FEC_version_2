"""Smart-parking dashboard backend: a hand-written WSGI application on
wsgiref.simple_server (stdlib), matching the fog node's "no framework"
discipline. Route dispatch is a manual if/elif chain in app(); static
assets (index.html/style.css/dashboard.js/vendor/chart.umd.min.js) are read
off disk and served with a small extension->content-type table instead of a
framework's StaticFiles mount.
"""

import datetime
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

import data_access
from status import lot_status, occupancy_pct
from thresholds_proxy import ThresholdsUnavailable, fetch_thresholds

FOG_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")
FOG_THRESHOLDS_URL = os.getenv("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds")
PIPELINE_FRESH_SECONDS = 30

STATIC_DIR = Path(__file__).parent / "static"

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
}

_REASON = {200: "OK", 400: "Bad Request", 404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway"}


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class QuietWSGIRequestHandler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        pass


class ThresholdsCache:
    """Caches fog's /thresholds response after the first successful fetch --
    the rule catalogue is static for the stack's lifetime, so there is no
    need to re-fetch it on every 2.5s dashboard poll."""

    def __init__(self):
        self._value = None

    def get(self, url):
        if self._value is None:
            self._value = fetch_thresholds(url)
        return self._value

    def reset(self):
        self._value = None


_thresholds_cache = ThresholdsCache()


def fog_reachable():
    try:
        with urllib.request.urlopen(FOG_HEALTH_URL, timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def build_lots_payload():
    """The project-specific per-lot grouping endpoint payload: all 5 raw
    sensor readings per lot, plus the computed occupancy_pct/status badge
    (see status.py for the exact formula)."""
    lots = []
    for lot in data_access.lot_report():
        readings = lot["readings"]
        occupied = readings.get("occupied_spaces")
        if occupied is not None:
            pct = occupancy_pct(occupied["avg"], lot["capacity"])
            alert_count = sum(len(r["alerts"]) for r in readings.values() if r)
            status = lot_status(pct, alert_count)
        else:
            pct, status = None, "pending"
        lots.append({
            "site_id": lot["site_id"],
            "capacity": lot["capacity"],
            "occupancy_pct": pct,
            "status": status,
            "readings": readings,
        })
    return {"lots": lots}


def build_health_payload():
    now = datetime.datetime.now(datetime.timezone.utc)
    freshest_age = data_access.freshest_window_age(now)
    pipeline_ok = freshest_age is not None and freshest_age <= PIPELINE_FRESH_SECONDS
    return {
        "gateway": fog_reachable(),
        "queue": data_access.queue_reachable(),
        "lambda": data_access.lambda_active(),
        "pipeline": pipeline_ok,
        "freshest_age_seconds": freshest_age,
    }


def build_backend_stats_payload():
    try:
        items = data_access.items_in_table()
    except Exception:
        items = 0
    return {"queue": data_access.queue_depth(), "items_in_table": items}


def _json_bytes(status, body):
    payload = json.dumps(body).encode("utf-8")
    status_line = f"{status} {_REASON.get(status, 'OK')}"
    headers = [("Content-Type", "application/json"), ("Content-Length", str(len(payload))), ("Cache-Control", "no-store")]
    return status_line, headers, payload


def _file_bytes(path):
    try:
        data = path.read_bytes()
    except OSError:
        return None
    content_type = CONTENT_TYPES.get(path.suffix, "application/octet-stream")
    headers = [("Content-Type", content_type), ("Content-Length", str(len(data))), ("Cache-Control", "no-store")]
    return "200 OK", headers, data


def _handle_readings(query):
    sensor_type = (query.get("sensor_type") or [None])[0]
    if not sensor_type or sensor_type not in data_access.SENSOR_TYPES:
        return _json_bytes(400, {
            "error": "sensor_type is required and must be one of: " + ", ".join(data_access.SENSOR_TYPES)
        })

    raw_limit = (query.get("limit") or ["60"])[0]
    try:
        limit = int(raw_limit)
        if limit <= 0:
            raise ValueError
    except ValueError:
        return _json_bytes(400, {"error": "limit must be a positive integer"})

    site_id = (query.get("site_id") or [None])[0]
    items = data_access.recent_windows(sensor_type, limit)
    if site_id:
        items = [item for item in items if item["site_id"] == site_id]
    return _json_bytes(200, {"sensor_type": sensor_type, "items": items})


def _handle_thresholds():
    try:
        body = _thresholds_cache.get(FOG_THRESHOLDS_URL)
    except ThresholdsUnavailable as exc:
        return _json_bytes(502, {"error": str(exc)})
    return _json_bytes(200, body)


def _serve_static(path):
    relative = path[len("/static/"):]
    if not relative or ".." in Path(relative).parts:
        return _json_bytes(400, {"error": "invalid static path"})
    result = _file_bytes(STATIC_DIR / relative)
    return result if result else _json_bytes(404, {"error": "not found"})


def app(environ, start_response):
    try:
        method = environ.get("REQUEST_METHOD", "GET")
        path = environ.get("PATH_INFO", "")
        query = urllib.parse.parse_qs(environ.get("QUERY_STRING", ""))

        if method != "GET":
            status_line, headers, payload = _json_bytes(404, {"error": f"no such route: {path}"})
        elif path == "/":
            result = _file_bytes(STATIC_DIR / "index.html")
            status_line, headers, payload = result if result else _json_bytes(404, {"error": "not found"})
        elif path.startswith("/static/"):
            status_line, headers, payload = _serve_static(path)
        elif path == "/api/readings":
            status_line, headers, payload = _handle_readings(query)
        elif path == "/api/lots":
            status_line, headers, payload = _json_bytes(200, build_lots_payload())
        elif path == "/api/thresholds":
            status_line, headers, payload = _handle_thresholds()
        elif path == "/api/health":
            status_line, headers, payload = _json_bytes(200, build_health_payload())
        elif path == "/api/backend-stats":
            status_line, headers, payload = _json_bytes(200, build_backend_stats_payload())
        else:
            status_line, headers, payload = _json_bytes(404, {"error": f"no such route: {path}"})
    except Exception as exc:
        status_line, headers, payload = _json_bytes(500, {"error": "internal server error", "detail": str(exc)})

    start_response(status_line, headers)
    return [payload]


def main():
    port = int(os.getenv("PORT", "8000"))
    with make_server("0.0.0.0", port, app, ThreadingWSGIServer, handler_class=QuietWSGIRequestHandler) as httpd:
        print(f"dashboard listening on :{port}", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
