"""Real-socket HTTP tests for the Tornado dashboard backend: same
tornado.testing.AsyncHTTPTestCase approach as test_fog_http.py. Data-access
and thresholds-proxy functions are stubbed with unittest.mock.patch.object
rather than pytest's monkeypatch fixture, since AsyncHTTPTestCase is a
unittest.TestCase subclass and its test methods do not receive pytest
fixtures as parameters.
"""

import json
from unittest.mock import patch

from tornado.testing import AsyncHTTPTestCase

from conftest import load_module

dashboard_app = load_module("mvs_dashboard_app", "backend/dashboard/app.py")

SAMPLE_VESSELS = [
    {"site_id": "vessel-a", "readings": {}},
    {"site_id": "vessel-b", "readings": {}},
]


class TestDashboardHttp(AsyncHTTPTestCase):
    def get_app(self):
        dashboard_app._thresholds_cache.reset()
        return dashboard_app.make_app()

    def get_json(self, path):
        response = self.fetch(path)
        return response.code, json.loads(response.body)

    def test_index_serves_html(self):
        response = self.fetch("/")
        self.assertEqual(response.code, 200)
        self.assertIn("<title>", response.body.decode())

    def test_static_style_served(self):
        response = self.fetch("/static/style.css")
        self.assertEqual(response.code, 200)

    def test_valid_sensor_type_returns_items(self):
        with patch.object(dashboard_app.data_access, "recent_windows", lambda sensor_type, limit: [{"avg": 1.0, "site_id": "vessel-a"}]):
            status, payload = self.get_json("/api/readings?sensor_type=engine_room_temp_c&limit=10")
        self.assertEqual(status, 200)
        self.assertEqual(payload["sensor_type"], "engine_room_temp_c")
        self.assertEqual(len(payload["items"]), 1)

    def test_unknown_sensor_type_rejected_with_400(self):
        status, payload = self.get_json("/api/readings?sensor_type=not_real")
        self.assertEqual(status, 400)
        self.assertIn("error", payload)

    def test_bad_limit_rejected_with_400(self):
        status, _payload = self.get_json("/api/readings?sensor_type=engine_room_temp_c&limit=abc")
        self.assertEqual(status, 400)

    def test_negative_limit_rejected_with_400(self):
        status, _payload = self.get_json("/api/readings?sensor_type=engine_room_temp_c&limit=-5")
        self.assertEqual(status, 400)

    def test_site_id_filters_results(self):
        rows = [{"site_id": "vessel-a", "avg": 1.0}, {"site_id": "vessel-b", "avg": 2.0}]
        with patch.object(dashboard_app.data_access, "recent_windows", lambda sensor_type, limit: rows):
            status, payload = self.get_json("/api/readings?sensor_type=engine_room_temp_c&site_id=vessel-b")
        self.assertEqual(status, 200)
        self.assertEqual(payload["items"], [{"site_id": "vessel-b", "avg": 2.0}])

    def test_api_vessels_returns_vessel_report(self):
        with patch.object(dashboard_app.data_access, "vessel_report", lambda: SAMPLE_VESSELS):
            status, payload = self.get_json("/api/vessels")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"vessels": SAMPLE_VESSELS})

    def test_api_voyage_log_returns_entries(self):
        entries = [{"window_end": "t1", "site_id": "vessel-a", "sensor_type": "hull_vibration_mm"}]
        with patch.object(dashboard_app.data_access, "recent_log_entries", lambda limit: entries):
            status, payload = self.get_json("/api/voyage-log?limit=5")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"entries": entries})

    def test_api_voyage_log_bad_limit_rejected_with_400(self):
        status, _payload = self.get_json("/api/voyage-log?limit=0")
        self.assertEqual(status, 400)

    def test_api_health_all_true(self):
        with patch.object(dashboard_app, "fog_reachable", lambda: True), \
             patch.object(dashboard_app.data_access, "queue_reachable", lambda: True), \
             patch.object(dashboard_app.data_access, "lambda_active", lambda: True), \
             patch.object(dashboard_app.data_access, "freshest_window_age", lambda now: 2.0):
            status, payload = self.get_json("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {
            "gateway": True, "queue": True, "lambda": True,
            "pipeline": True, "freshest_age_seconds": 2.0,
        })

    def test_api_health_all_false(self):
        with patch.object(dashboard_app, "fog_reachable", lambda: False), \
             patch.object(dashboard_app.data_access, "queue_reachable", lambda: False), \
             patch.object(dashboard_app.data_access, "lambda_active", lambda: False), \
             patch.object(dashboard_app.data_access, "freshest_window_age", lambda now: None):
            status, payload = self.get_json("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {
            "gateway": False, "queue": False, "lambda": False,
            "pipeline": False, "freshest_age_seconds": None,
        })

    def test_api_backend_stats(self):
        with patch.object(dashboard_app.data_access, "queue_depth", lambda: {"waiting": 2, "in_flight": 1}), \
             patch.object(dashboard_app.data_access, "items_in_table", lambda: 42):
            status, payload = self.get_json("/api/backend-stats")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"queue": {"waiting": 2, "in_flight": 1}, "items_in_table": 42})

    def test_api_thresholds_proxies_fog(self):
        with patch.object(dashboard_app, "fetch_thresholds", lambda url, timeout=5: {"engine_room_temp_c": []}):
            status, payload = self.get_json("/api/thresholds")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"engine_room_temp_c": []})

    def test_api_thresholds_returns_502_when_fog_unreachable(self):
        def unreachable(url, timeout=5):
            raise dashboard_app.ThresholdsUnavailable("nope")

        with patch.object(dashboard_app, "fetch_thresholds", unreachable):
            status, payload = self.get_json("/api/thresholds")
        self.assertEqual(status, 502)
        self.assertIn("error", payload)
