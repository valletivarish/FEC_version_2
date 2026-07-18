"""Smart-building dashboard backend: plain http.server ThreadingHTTPServer with a hand-written do_GET if/elif route table and on-disk static assets, no web framework."""

import datetime
import json
import os
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import data_access
from scoring import efficiency_score, letter_grade
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


class ThresholdsCache:
    """Caches fog's /thresholds response after the first success, since the rule catalogue is static for the stack's lifetime."""

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


def build_floor_payload():
    """Per-floor payload: all 5 raw sensor readings per floor plus the computed efficiency_score/efficiency_grade badge (formula in scoring.py)."""
    floors = []
    for floor in data_access.floor_report():
        readings = floor["readings"]
        energy = readings.get("energy_consumption_kw")
        co2 = readings.get("co2_ppm")
        if energy is not None and co2 is not None:
            score = efficiency_score(energy["avg"], co2["avg"])
            grade = letter_grade(score)
        else:
            score, grade = None, None
        floors.append({
            "site_id": floor["site_id"],
            "efficiency_score": score,
            "efficiency_grade": grade,
            "readings": readings,
        })
    return {"floors": floors}


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


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "SmartBuildingDashboard/1.0"

    def log_message(self, fmt, *args):
        pass

    def _send_json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_file(self, path):
        try:
            data = path.read_bytes()
        except OSError:
            self._send_json(404, {"error": "not found"})
            return
        content_type = CONTENT_TYPES.get(path.suffix, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        try:
            parsed = urllib.parse.urlsplit(self.path)
            path, query = parsed.path, urllib.parse.parse_qs(parsed.query)

            if path == "/":
                self._send_file(STATIC_DIR / "index.html")
            elif path.startswith("/static/"):
                self._serve_static(path)
            elif path == "/api/readings":
                self._handle_readings(query)
            elif path == "/api/floors":
                self._send_json(200, build_floor_payload())
            elif path == "/api/thresholds":
                self._handle_thresholds()
            elif path == "/api/health":
                self._send_json(200, build_health_payload())
            elif path == "/api/backend-stats":
                self._send_json(200, build_backend_stats_payload())
            else:
                self._send_json(404, {"error": f"no such route: {path}"})
        except Exception as exc:
            self._send_json(500, {"error": "internal server error", "detail": str(exc)})

    def _serve_static(self, path):
        relative = path[len("/static/"):]
        if not relative or ".." in Path(relative).parts:
            self._send_json(400, {"error": "invalid static path"})
            return
        self._send_file(STATIC_DIR / relative)

    def _handle_readings(self, query):
        sensor_type = (query.get("sensor_type") or [None])[0]
        if not sensor_type or sensor_type not in data_access.SENSOR_TYPES:
            self._send_json(400, {
                "error": "sensor_type is required and must be one of: "
                         + ", ".join(data_access.SENSOR_TYPES)
            })
            return

        raw_limit = (query.get("limit") or ["60"])[0]
        try:
            limit = int(raw_limit)
            if limit <= 0:
                raise ValueError
        except ValueError:
            self._send_json(400, {"error": "limit must be a positive integer"})
            return

        site_id = (query.get("site_id") or [None])[0]
        items = data_access.recent_windows(sensor_type, limit)
        if site_id:
            items = [item for item in items if item["site_id"] == site_id]
        self._send_json(200, {"sensor_type": sensor_type, "items": items})

    def _handle_thresholds(self):
        try:
            body = _thresholds_cache.get(FOG_THRESHOLDS_URL)
        except ThresholdsUnavailable as exc:
            self._send_json(502, {"error": str(exc)})
            return
        self._send_json(200, body)


def main():
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), DashboardHandler)
    print(f"dashboard listening on :{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
