"""Pure payload builders shared by the aiohttp server and the Lambda entry point; each takes a plain params dict and returns (status, body)."""
import datetime
import os
import urllib.error
import urllib.request

import data_access
import stage_view
from thresholds_proxy import ThresholdsUnavailable, fetch

FOG_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")
FOG_THRESHOLDS_URL = os.getenv("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds")
FRESH_SECONDS = 30
_thresholds_cache = {}


def reaches(params=None):
    windows = data_access.reach_windows()
    series = data_access.level_series_per_reach()
    built = []
    for site, readings in windows.items():
        rise = stage_view.rise_over(series.get(site))
        status = stage_view.reach_status(readings, rise)
        built.append({"site_id": site, **status, "readings": readings})
    return 200, {"catchment_stage": stage_view.catchment_stage(built), "reaches": built}


def readings(params):
    sensor_type = params.get("sensor_type")
    if not sensor_type or sensor_type not in data_access.SENSOR_TYPES:
        return 400, {"error": "sensor_type must be one of: " + ", ".join(data_access.SENSOR_TYPES)}
    try:
        limit = int(params.get("limit", "60"))
        if limit <= 0:
            raise ValueError
    except ValueError:
        return 400, {"error": "limit must be a positive integer"}
    rows = data_access.recent_windows(sensor_type, limit)
    site = params.get("site_id")
    if site:
        rows = [row for row in rows if row["site_id"] == site]
    return 200, {"sensor_type": sensor_type, "items": rows}


def _fog_online():
    try:
        with urllib.request.urlopen(FOG_HEALTH_URL, timeout=2) as response:
            return response.status == 200
    except Exception:
        return False


def health(params=None):
    now = datetime.datetime.now(datetime.timezone.utc)
    age = data_access.freshest_age_seconds(now)
    return 200, {
        "gateway": _fog_online(),
        "queue": data_access.queue_reachable(),
        "lambda": data_access.lambda_active(),
        "pipeline": age is not None and age <= FRESH_SECONDS,
        "freshest_age_seconds": age,
    }


def backend_stats(params=None):
    try:
        items = data_access.stored_count()
    except Exception:
        items = 0
    return 200, {"queue": data_access.queue_stats(), "items_in_table": items}


def thresholds(params=None):
    if "value" not in _thresholds_cache:
        try:
            _thresholds_cache["value"] = fetch(FOG_THRESHOLDS_URL)
        except ThresholdsUnavailable as exc:
            return 502, {"error": str(exc)}
    return 200, _thresholds_cache["value"]


ROUTES = {
    "/api/reaches": reaches,
    "/api/readings": readings,
    "/api/health": health,
    "/api/backend-stats": backend_stats,
    "/api/thresholds": thresholds,
}
