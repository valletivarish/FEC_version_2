import pytest
from fastapi.testclient import TestClient

from conftest import load_module

dash_app = load_module("dash_app", "backend/dashboard/app.py")


@pytest.fixture
def api_client():
    return TestClient(dash_app.app)


class TestWiring:
    def test_index_serves_static_html(self, api_client):
        resp = api_client.get("/")
        assert resp.status_code == 200
        assert "no-store" in resp.headers["cache-control"]

    def test_static_assets_are_mounted(self, api_client):
        resp = api_client.get("/static/dashboard.js")
        assert resp.status_code == 200
        assert "no-store" in resp.headers["cache-control"]

    @pytest.mark.parametrize(
        "path",
        ["/api/readings?sensor_type=humidity", "/api/manifest", "/api/thresholds"],
    )
    def test_readings_routers_are_included(self, path, api_client, monkeypatch):
        import routes as routes_module
        monkeypatch.setattr(routes_module, "recent_windows", lambda *a, **k: [])
        monkeypatch.setattr(routes_module.urllib.request, "urlopen",
                             lambda url, timeout: _EmptyThresholds())
        resp = api_client.get(path)
        assert resp.status_code != 404

    def test_health_router_is_included(self, api_client, monkeypatch):
        import health as health_module
        monkeypatch.setattr(health_module, "recent_windows", lambda *a, **k: [])
        monkeypatch.setattr(health_module, "sqs", lambda: _FailingClient())
        monkeypatch.setattr(health_module, "lambda_client", lambda: _FailingClient())
        monkeypatch.setattr(health_module.urllib.request, "urlopen", _raise_oserror)
        resp = api_client.get("/api/health")
        assert resp.status_code == 200

    def test_backend_stats_router_is_included(self, api_client, monkeypatch):
        import routes as routes_module
        monkeypatch.setattr(routes_module, "sqs", lambda: _FailingClient())
        monkeypatch.setattr(routes_module, "table", lambda: _CountingClient())
        resp = api_client.get("/api/backend-stats")
        assert resp.status_code == 200


class _FailingClient:
    def __getattr__(self, name):
        raise RuntimeError("unreachable in test")


class _CountingClient:
    def scan(self, TableName, Select):
        return {"Count": 0}


def _raise_oserror(url, timeout):
    raise OSError("unreachable")


class _EmptyThresholds:
    def read(self):
        return b"{}"

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False
