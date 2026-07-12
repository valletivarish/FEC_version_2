"""Marine vessel dashboard backend: Tornado, matching the fog node's
framework choice. Handlers are tornado.web.RequestHandler subclasses; static
assets are served through tornado.web.StaticFileHandler (Tornado's own
built-in static handler) rather than a hand-rolled file server or a second
framework's static mount.
"""

import datetime
import os
from pathlib import Path

import tornado.ioloop
import tornado.web

import data_access
from thresholds_proxy import ThresholdsUnavailable, fetch_thresholds

FOG_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")
FOG_THRESHOLDS_URL = os.getenv("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds")
PIPELINE_FRESH_SECONDS = 30

STATIC_DIR = Path(__file__).parent / "static"


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
        fetch_thresholds(FOG_HEALTH_URL, timeout=2)
        return True
    except ThresholdsUnavailable:
        return False


class BaseHandler(tornado.web.RequestHandler):
    def set_default_headers(self):
        self.set_header("Cache-Control", "no-store")


class IndexHandler(BaseHandler):
    def get(self):
        self.set_header("Content-Type", "text/html; charset=utf-8")
        self.write((STATIC_DIR / "index.html").read_bytes())


class ReadingsHandler(BaseHandler):
    def get(self):
        sensor_type = self.get_query_argument("sensor_type", None)
        if not sensor_type or sensor_type not in data_access.SENSOR_TYPES:
            self.set_status(400)
            self.write({
                "error": "sensor_type is required and must be one of: " + ", ".join(data_access.SENSOR_TYPES)
            })
            return

        raw_limit = self.get_query_argument("limit", "60")
        try:
            limit = int(raw_limit)
            if limit <= 0:
                raise ValueError
        except ValueError:
            self.set_status(400)
            self.write({"error": "limit must be a positive integer"})
            return

        site_id = self.get_query_argument("site_id", None)
        items = data_access.recent_windows(sensor_type, limit)
        if site_id:
            items = [item for item in items if item["site_id"] == site_id]
        self.write({"sensor_type": sensor_type, "items": items})


class VesselsHandler(BaseHandler):
    def get(self):
        # Project-specific per-site grouping endpoint: feeds the Bridge
        # Console two-column comparison panel.
        self.write({"vessels": data_access.vessel_report()})


class VoyageLogHandler(BaseHandler):
    def get(self):
        raw_limit = self.get_query_argument("limit", "25")
        try:
            limit = int(raw_limit)
            if limit <= 0:
                raise ValueError
        except ValueError:
            self.set_status(400)
            self.write({"error": "limit must be a positive integer"})
            return
        self.write({"entries": data_access.recent_log_entries(limit)})


class ThresholdsHandler(BaseHandler):
    def get(self):
        try:
            body = _thresholds_cache.get(FOG_THRESHOLDS_URL)
        except ThresholdsUnavailable as exc:
            self.set_status(502)
            self.write({"error": str(exc)})
            return
        self.write(body)


class HealthHandler(BaseHandler):
    def get(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        freshest_age = data_access.freshest_window_age(now)
        pipeline_ok = freshest_age is not None and freshest_age <= PIPELINE_FRESH_SECONDS
        self.write({
            "gateway": fog_reachable(),
            "queue": data_access.queue_reachable(),
            "lambda": data_access.lambda_active(),
            "pipeline": pipeline_ok,
            "freshest_age_seconds": freshest_age,
        })


class BackendStatsHandler(BaseHandler):
    def get(self):
        try:
            items = data_access.items_in_table()
        except Exception:
            items = 0
        self.write({"queue": data_access.queue_depth(), "items_in_table": items})


def make_app():
    return tornado.web.Application([
        (r"/", IndexHandler),
        (r"/api/readings", ReadingsHandler),
        (r"/api/vessels", VesselsHandler),
        (r"/api/voyage-log", VoyageLogHandler),
        (r"/api/thresholds", ThresholdsHandler),
        (r"/api/health", HealthHandler),
        (r"/api/backend-stats", BackendStatsHandler),
        (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": str(STATIC_DIR)}),
    ])


def main():
    port = int(os.getenv("PORT", "8000"))
    app = make_app()
    app.listen(port)
    print(f"dashboard listening on :{port}", flush=True)
    tornado.ioloop.IOLoop.current().start()


if __name__ == "__main__":
    main()
