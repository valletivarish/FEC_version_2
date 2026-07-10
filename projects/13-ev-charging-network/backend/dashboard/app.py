"""EV charging-hub dashboard backend: Flask, matching the fog node's
framework choice (@app.route decorators, manual query-string parsing via
request.args, no Pydantic). Static assets (index.html/style.css/
dashboard.js/vendor/chart.umd.min.js) are served through Flask's built-in
static handler rather than a hand-rolled file server.
"""

import datetime
import os
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import data_access
from thresholds_proxy import ThresholdsUnavailable, fetch_thresholds

FOG_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")
FOG_THRESHOLDS_URL = os.getenv("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds")
PIPELINE_FRESH_SECONDS = 30

STATIC_DIR = Path(__file__).parent / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")


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


@app.after_request
def no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "not found"}), 404


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/api/readings")
def readings():
    sensor_type = request.args.get("sensor_type")
    if not sensor_type or sensor_type not in data_access.SENSOR_TYPES:
        return jsonify({
            "error": "sensor_type is required and must be one of: " + ", ".join(data_access.SENSOR_TYPES)
        }), 400

    raw_limit = request.args.get("limit", "60")
    try:
        limit = int(raw_limit)
        if limit <= 0:
            raise ValueError
    except ValueError:
        return jsonify({"error": "limit must be a positive integer"}), 400

    site_id = request.args.get("site_id")
    items = data_access.recent_windows(sensor_type, limit)
    if site_id:
        items = [item for item in items if item["site_id"] == site_id]
    return jsonify({"sensor_type": sensor_type, "items": items}), 200


@app.route("/api/hubs")
def hubs():
    # Project-specific per-site grouping endpoint: all 5 sensor types' most
    # recent window, grouped by charging hub. No derived scoring is
    # layered on top -- alert badges (fog/alerts.py) are the only computed
    # signal this project shows per hub.
    return jsonify({"hubs": data_access.hub_report()}), 200


@app.route("/api/thresholds")
def thresholds():
    try:
        body = _thresholds_cache.get(FOG_THRESHOLDS_URL)
    except ThresholdsUnavailable as exc:
        return jsonify({"error": str(exc)}), 502
    return jsonify(body), 200


@app.route("/api/health")
def health():
    now = datetime.datetime.now(datetime.timezone.utc)
    freshest_age = data_access.freshest_window_age(now)
    pipeline_ok = freshest_age is not None and freshest_age <= PIPELINE_FRESH_SECONDS
    return jsonify({
        "gateway": fog_reachable(),
        "queue": data_access.queue_reachable(),
        "lambda": data_access.lambda_active(),
        "pipeline": pipeline_ok,
        "freshest_age_seconds": freshest_age,
    }), 200


@app.route("/api/backend-stats")
def backend_stats():
    try:
        items = data_access.items_in_table()
    except Exception:
        items = 0
    return jsonify({"queue": data_access.queue_depth(), "items_in_table": items}), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, threaded=True)
